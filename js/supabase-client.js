/**
 * TSATSAKPORNU POS - SUPABASE CLIENT & DATA ADAPTER
 * Provides direct Supabase Cloud backend integration with seamless offline/local demo fallback.
 */

const STORAGE_KEYS = {
  SUPABASE_URL: 'ntoso_sb_url',
  SUPABASE_KEY: 'ntoso_sb_key',
  LOCAL_DB: 'ntoso_pos_db_v2',
  AUTH_SESSION: 'ntoso_pos_session'
};

// Empty defaults — add your real products via the Admin panel
const DEFAULT_PRODUCTS = [];

// Empty defaults — real sales will be recorded from the POS terminal
const DEFAULT_SALES = [];

class SupabaseDataService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.localDB = this.loadLocalDB();
  }

  loadLocalDB() {
    const saved = localStorage.getItem(STORAGE_KEYS.LOCAL_DB);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.products)) {
          return parsed;
        }
      } catch (e) {
        console.error('Error parsing local DB:', e);
      }
    }
    const initial = {
      products: DEFAULT_PRODUCTS,
      sales: DEFAULT_SALES,
      categories: ['All Items', 'Beverages', 'Groceries', 'Toiletries', 'School & Office', 'Provisions']
    };
    this.saveLocalDB(initial);
    return initial;
  }

  saveLocalDB(data) {
    if (data) this.localDB = data;
    localStorage.setItem(STORAGE_KEYS.LOCAL_DB, JSON.stringify(this.localDB));
  }

  async initClient() {
    const url = localStorage.getItem(STORAGE_KEYS.SUPABASE_URL);
    const key = localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY);

    if (url && key && window.supabase) {
      try {
        this.client = window.supabase.createClient(url, key);
        // Test query
        const { data, error } = await this.client.from('products').select('count', { count: 'exact', head: true });
        if (!error) {
          this.isConnected = true;
          console.log('✅ Connected to Supabase backend successfully.');
          return { success: true, mode: 'cloud' };
        } else {
          console.warn('Supabase query failed, using local mode:', error.message);
          this.isConnected = false;
          return { success: false, error: error.message, mode: 'local' };
        }
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
        this.isConnected = false;
        return { success: false, error: err.message, mode: 'local' };
      }
    }

    this.isConnected = false;
    return { success: true, mode: 'local' };
  }

  async setCredentials(url, key) {
    url = (url || '').trim();
    key = (key || '').trim();
    if (url && key) {
      localStorage.setItem(STORAGE_KEYS.SUPABASE_URL, url);
      localStorage.setItem(STORAGE_KEYS.SUPABASE_KEY, key);
      return await this.initClient();
    } else {
      localStorage.removeItem(STORAGE_KEYS.SUPABASE_URL);
      localStorage.removeItem(STORAGE_KEYS.SUPABASE_KEY);
      this.client = null;
      this.isConnected = false;
      return { success: true, mode: 'local' };
    }
  }

  getCredentials() {
    return {
      url: localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '',
      key: localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY) || ''
    };
  }

  /* ================= PRODUCTS CRUD ================= */
  async getProducts() {
    if (this.isConnected && this.client) {
      try {
        const { data, error } = await this.client
          .from('products')
          .select('*')
          .order('name', { ascending: true });
        if (!error && data && data.length > 0) {
          this.localDB.products = data;
          this.saveLocalDB();
          return data;
        }
      } catch (e) {
        console.error('Cloud getProducts error, falling back:', e);
      }
    }
    return this.localDB.products;
  }

  async saveProduct(product) {
    if (!product.id) {
      product.id = 'p-' + Date.now().toString(36);
    }
    product.cost_price = Number(product.cost_price) || 0;
    product.selling_price = Number(product.selling_price) || 0;
    product.stock = parseInt(product.stock) || 0;
    product.min_stock_alert = parseInt(product.min_stock_alert) || 5;

    // Check existing
    const idx = this.localDB.products.findIndex(p => p.id === product.id);
    if (idx >= 0) {
      this.localDB.products[idx] = { ...this.localDB.products[idx], ...product };
    } else {
      this.localDB.products.push(product);
    }
    this.saveLocalDB();

    if (this.isConnected && this.client) {
      try {
        const { error } = await this.client
          .from('products')
          .upsert(product);
        if (error) console.error('Cloud upsert product error:', error);
      } catch (e) {
        console.error('Error syncing product to cloud:', e);
      }
    }

    return product;
  }

  async deleteProduct(productId) {
    this.localDB.products = this.localDB.products.filter(p => p.id !== productId);
    this.saveLocalDB();

    if (this.isConnected && this.client) {
      try {
        await this.client.from('products').delete().eq('id', productId);
      } catch (e) {
        console.error('Error deleting product from cloud:', e);
      }
    }
    return true;
  }

  async uploadProductImage(file) {
    if (!file) return null;

    const fileExt = file.name.split('.').pop() || 'png';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
    const filePath = `products/${fileName}`;

    if (this.isConnected && this.client) {
      try {
        const { data, error } = await this.client.storage
          .from('product-images')
          .upload(filePath, file, { cacheControl: '3600', upsert: true });

        if (error) {
          console.warn('Supabase storage upload error:', error);
          throw error;
        }

        const { data: publicUrlData } = this.client.storage
          .from('product-images')
          .getPublicUrl(filePath);

        return publicUrlData?.publicUrl || null;
      } catch (err) {
        console.error('Failed to upload to Supabase storage, using fallback:', err);
      }
    }

    // Fallback: convert to base64 Data URL for local storage
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async deductStock(items) {
    for (const item of items) {
      const prod = this.localDB.products.find(p => p.id === item.product_id);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        if (this.isConnected && this.client) {
          try {
            await this.client
              .from('products')
              .update({ stock: prod.stock })
              .eq('id', prod.id);
          } catch (e) {
            console.error('Error updating stock in cloud:', e);
          }
        }
      }
    }
    this.saveLocalDB();
  }

  /* ================= DATA RESET (WIPE EVERYTHING) ================= */
  async resetAllData() {
    // 1. Clear local storage
    this.localDB = {
      products: [],
      sales: [],
      categories: ['All Items', 'Beverages', 'Groceries', 'Toiletries', 'School & Office', 'Provisions']
    };
    this.saveLocalDB();

    // 2. Clear Supabase cloud tables if connected
    if (this.isConnected && this.client) {
      try {
        // Delete sale_items first (FK dependency)
        await this.client.from('sale_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        // Delete sales
        await this.client.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        // Delete products
        await this.client.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        console.log('✅ Supabase cloud data cleared successfully.');
      } catch (e) {
        console.error('Error clearing cloud data:', e);
      }
    }

    return true;
  }

  /* ================= SALES CRUD ================= */
  async getSales() {
    if (this.isConnected && this.client) {
      try {
        const { data, error } = await this.client
          .from('sales')
          .select(`
            *,
            sale_items (*)
          `)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          // Normalize items
          const normalized = data.map(s => ({
            ...s,
            items: s.sale_items || []
          }));
          this.localDB.sales = normalized;
          this.saveLocalDB();
          return normalized;
        }
      } catch (e) {
        console.error('Cloud getSales error, falling back:', e);
      }
    }
    return this.localDB.sales;
  }

  async recordSale(saleData) {
    // Computations
    const id = 'sale-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const sale = {
      id,
      salesperson_id: saleData.salesperson_id || 'sales-default',
      salesperson_name: saleData.salesperson_name || 'Salesperson',
      customer_name: saleData.customer_name || 'Walk-in Customer',
      customer_phone: saleData.customer_phone || '',
      total_revenue: Number(saleData.total_revenue) || 0,
      total_cost: Number(saleData.total_cost) || 0,
      net_profit: Number(saleData.net_profit) || 0,
      payment_method: saleData.payment_method || 'cash',
      notes: saleData.notes || '',
      created_at: new Date().toISOString(),
      items: saleData.items || []
    };

    // Save locally
    this.localDB.sales.unshift(sale);
    await this.deductStock(sale.items);
    this.saveLocalDB();

    // Sync with Supabase cloud if connected
    if (this.isConnected && this.client) {
      try {
        const { data: insertedSale, error: saleErr } = await this.client
          .from('sales')
          .insert({
            salesperson_id: sale.salesperson_id.startsWith('user-') ? null : sale.salesperson_id,
            salesperson_name: sale.salesperson_name,
            customer_name: sale.customer_name,
            customer_phone: sale.customer_phone,
            total_revenue: sale.total_revenue,
            total_cost: sale.total_cost,
            net_profit: sale.net_profit,
            payment_method: sale.payment_method,
            notes: sale.notes,
            created_at: sale.created_at
          })
          .select()
          .single();

        if (!saleErr && insertedSale && sale.items.length > 0) {
          const itemsPayload = sale.items.map(it => ({
            sale_id: insertedSale.id,
            product_name: it.product_name,
            quantity: it.quantity,
            cost_price: it.cost_price,
            selling_price: it.selling_price,
            subtotal_revenue: it.subtotal_revenue,
            subtotal_cost: it.subtotal_cost,
            subtotal_profit: it.subtotal_profit
          }));
          await this.client.from('sale_items').insert(itemsPayload);
        }
      } catch (e) {
        console.error('Error inserting sale to cloud:', e);
      }
    }

    return sale;
  }
}

// Global data service instance
window.dataService = new SupabaseDataService();
