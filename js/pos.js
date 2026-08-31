/**
 * NTOSO POS - SALES TERMINAL MODULE
 * Handles Cashier Point of Sale, Product Catalog, Cart, Checkout, Stock deduction, and Receipts.
 */

class PosService {
  constructor() {
    this.cart = [];
    this.selectedCategory = 'All Items';
    this.searchQuery = '';
    this.paymentMethod = 'cash';
    this.products = [];
  }

  async init() {
    await this.refreshProducts();
    this.render();
  }

  async refreshProducts() {
    this.products = await window.dataService.getProducts();
  }

  setCategory(cat) {
    this.selectedCategory = cat;
    this.renderCategoryPills();
    this.renderProductGrid();
  }

  setSearchQuery(q) {
    this.searchQuery = q || '';
    this.renderProductGrid();
  }

  setPaymentMethod(pm) {
    this.paymentMethod = pm;
    document.querySelectorAll('.pay-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.method === pm);
    });
  }

  addToCart(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    if (product.stock <= 0) {
      window.app.showToast('Item is out of stock', 'error');
      return;
    }

    const existing = this.cart.find(item => item.product_id === productId);
    if (existing) {
      if (existing.quantity + 1 > product.stock) {
        window.app.showToast(`Only ${product.stock} available in stock`, 'error');
        return;
      }
      existing.quantity += 1;
      existing.subtotal_revenue = existing.quantity * existing.selling_price;
      existing.subtotal_cost = existing.quantity * existing.cost_price;
      existing.subtotal_profit = existing.subtotal_revenue - existing.subtotal_cost;
    } else {
      this.cart.push({
        product_id: product.id,
        product_name: product.name,
        category: product.category,
        cost_price: Number(product.cost_price) || 0,
        selling_price: Number(product.selling_price) || 0,
        quantity: 1,
        subtotal_revenue: Number(product.selling_price) || 0,
        subtotal_cost: Number(product.cost_price) || 0,
        subtotal_profit: (Number(product.selling_price) || 0) - (Number(product.cost_price) || 0)
      });
    }

    this.renderCart();
    window.app.showToast(`Added ${product.name} to cart`, 'info');
  }

  updateQty(productId, delta) {
    const item = this.cart.find(i => i.product_id === productId);
    const prod = this.products.find(p => p.id === productId);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
      this.cart = this.cart.filter(i => i.product_id !== productId);
    } else {
      if (prod && item.quantity > prod.stock) {
        item.quantity = prod.stock;
        window.app.showToast(`Maximum available stock is ${prod.stock}`, 'error');
      }
      item.subtotal_revenue = item.quantity * item.selling_price;
      item.subtotal_cost = item.quantity * item.cost_price;
      item.subtotal_profit = item.subtotal_revenue - item.subtotal_cost;
    }

    this.renderCart();
  }

  clearCart() {
    this.cart = [];
    this.renderCart();
    window.app.showToast('Cart cleared', 'info');
  }

  getCartTotals() {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalQty = 0;

    for (const item of this.cart) {
      totalRevenue += item.quantity * item.selling_price;
      totalCost += item.quantity * item.cost_price;
      totalQty += item.quantity;
    }

    const netProfit = totalRevenue - totalCost;

    return {
      totalRevenue,
      totalCost,
      netProfit,
      totalQty
    };
  }

  async completeSale() {
    if (this.cart.length === 0) {
      window.app.showToast('Your cart is empty. Add items first.', 'error');
      return;
    }

    const user = window.authService.getUser();
    if (!user) {
      window.app.showToast('Please log in to complete sales', 'error');
      return;
    }

    // Verify stock availability
    for (const item of this.cart) {
      const prod = this.products.find(p => p.id === item.product_id);
      if (!prod || prod.stock < item.quantity) {
        window.app.showToast(`Not enough stock for ${item.product_name}! Available: ${prod?.stock || 0}`, 'error');
        return;
      }
    }

    const custNameInput = document.getElementById('posCustomerName');
    const custPhoneInput = document.getElementById('posCustomerPhone');
    const notesInput = document.getElementById('posNotes');

    const totals = this.getCartTotals();

    const salePayload = {
      salesperson_id: user.id,
      salesperson_name: user.full_name || user.email,
      customer_name: (custNameInput?.value || '').trim() || 'Walk-in Customer',
      customer_phone: (custPhoneInput?.value || '').trim(),
      total_revenue: totals.totalRevenue,
      total_cost: totals.totalCost,
      net_profit: totals.netProfit,
      payment_method: this.paymentMethod,
      notes: (notesInput?.value || '').trim(),
      items: JSON.parse(JSON.stringify(this.cart))
    };

    // Save transaction
    const completedSale = await window.dataService.recordSale(salePayload);

    // Refresh products list
    await this.refreshProducts();

    // Clear form and cart
    const receiptData = { ...completedSale, items: [...this.cart] };
    this.cart = [];
    if (custNameInput) custNameInput.value = '';
    if (custPhoneInput) custPhoneInput.value = '';
    if (notesInput) notesInput.value = '';

    // Render updates
    this.render();
    if (window.adminService) {
      window.adminService.refresh();
    }

    window.app.showToast(`Sale recorded successfully! Total: ₵${totals.totalRevenue.toFixed(2)}`, 'success');

    // Show receipt
    this.showReceiptModal(receiptData);
  }

  showReceiptModal(sale) {
    const receiptHtml = `
      <div class="receipt-paper">
        <div class="receipt-header">
          <h3>TSATSAKPORNU</h3>
          <div style="font-size: 11px; margin-top: 2px;">Premium Quality Retail & Provisions</div>
          <div style="font-size: 10.5px; margin-top: 4px;">Hohoe, Ghana · Tel: 0244270887</div>
          <div style="font-size: 10px; margin-top: 6px; color: #555;">Receipt: #${sale.id.slice(-8).toUpperCase()}</div>
          <div style="font-size: 10px;">Date: ${new Date(sale.created_at).toLocaleString()}</div>
        </div>

        <div style="margin-bottom: 8px; font-size: 11px;">
          <div><strong>Cashier:</strong> ${sale.salesperson_name}</div>
          <div><strong>Customer:</strong> ${sale.customer_name} ${sale.customer_phone ? '('+sale.customer_phone+')' : ''}</div>
          <div><strong>Payment:</strong> <span style="text-transform:uppercase;">${sale.payment_method}</span></div>
        </div>

        <div class="receipt-divider"></div>

        <div style="display:flex; justify-content:space-between; font-weight:700; font-size:11px; margin-bottom:4px;">
          <span>Item</span>
          <span>Qty × Price</span>
          <span>Total</span>
        </div>

        ${sale.items.map(it => `
          <div class="receipt-row" style="font-size: 11px;">
            <div style="flex:1; padding-right:6px;">${it.product_name}</div>
            <div style="white-space:nowrap; margin-right:8px;">${it.quantity} × ₵${Number(it.selling_price).toFixed(2)}</div>
            <div style="font-weight:700;">₵${Number(it.subtotal_revenue).toFixed(2)}</div>
          </div>
        `).join('')}

        <div class="receipt-divider"></div>

        <div class="receipt-total-row">
          <span>GRAND TOTAL</span>
          <span>₵${Number(sale.total_revenue).toFixed(2)}</span>
        </div>

        <div class="receipt-divider"></div>

        <div style="text-align:center; font-size: 10.5px; margin-top: 10px; color: #444;">
          <p>Thank you for shopping with us!</p>
          <p style="margin-top: 2px;">Goods sold are non-refundable.</p>
        </div>
      </div>

      <div style="display:flex; gap:10px; margin-top: 20px;">
        <button class="btn btn-primary btn-block" onclick="window.print()">🖨️ Print Receipt</button>
        <button class="btn btn-ghost" onclick="window.app.closeModal()">Close</button>
      </div>
    `;

    window.app.openModal('Sales Receipt', receiptHtml);
  }

  renderCategoryPills() {
    const container = document.getElementById('posCategoryPills');
    if (!container) return;

    const categories = ['All Items', 'Beverages', 'Groceries', 'Toiletries', 'School & Office', 'Provisions'];
    container.innerHTML = categories.map(cat => `
      <button class="cat-pill ${this.selectedCategory === cat ? 'active' : ''}" onclick="window.posService.setCategory('${cat}')">
        ${cat}
      </button>
    `).join('');
  }

  renderProductGrid() {
    const container = document.getElementById('posProductGrid');
    if (!container) return;

    let filtered = this.products;

    if (this.selectedCategory !== 'All Items') {
      filtered = filtered.filter(p => p.category === this.selectedCategory);
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.sku && p.sku.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">🔍</div>
          <h4>No products found</h4>
          <p>Try searching for a different item or switch categories.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(p => {
      const isOutOfStock = p.stock <= 0;
      const isLowStock = p.stock > 0 && p.stock <= (p.min_stock_alert || 5);
      
      let stockBadge = `<span class="badge badge-success">${p.stock} in stock</span>`;
      if (isOutOfStock) {
        stockBadge = `<span class="badge badge-danger">Out of stock</span>`;
      } else if (isLowStock) {
        stockBadge = `<span class="badge badge-warning">Low: ${p.stock} left</span>`;
      }

      return `
        <button 
          type="button" 
          class="pos-item-card" 
          ${isOutOfStock ? 'disabled' : ''} 
          onclick="window.posService.addToCart('${p.id}')"
        >
          <div style="display:flex; gap:10px; align-items:flex-start;">
            ${p.image_url ? `
              <div style="width:40px; height:40px; border-radius:6px; background:var(--surface-alt); border:1px solid var(--line); overflow:hidden; flex-shrink:0;">
                <img src="${p.image_url}" alt="${p.name}" style="width:100%; height:100%; object-fit:cover;">
              </div>
            ` : ''}
            <div style="flex:1;">
              <div class="item-cat">${p.category || 'General'}</div>
              <div class="item-name">${p.name}</div>
            </div>
          </div>
          <div style="margin-top:8px;">
            <div class="item-price mono">₵${Number(p.selling_price).toFixed(2)}</div>
            <div class="item-stock">${stockBadge}</div>
          </div>
        </button>
      `;
    }).join('');
  }

  renderCart() {
    const listContainer = document.getElementById('posCartList');
    const totalQtyEl = document.getElementById('posCartTotalQty');
    const totalAmountEl = document.getElementById('posCartTotalAmount');

    if (!listContainer) return;

    if (this.cart.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🛒</div>
          <h4>Cart is Empty</h4>
          <p>Click on any product on the left to add it to this sale.</p>
        </div>
      `;
      if (totalQtyEl) totalQtyEl.textContent = '0 items';
      if (totalAmountEl) totalAmountEl.textContent = '₵0.00';
      return;
    }

    listContainer.innerHTML = this.cart.map(item => `
      <div class="cart-item-row">
        <div class="cart-item-info">
          <div class="title">${item.product_name}</div>
          <div class="sub mono">₵${item.selling_price.toFixed(2)} each</div>
        </div>
        <div class="cart-qty-ctrls">
          <button class="cart-qty-btn" onclick="window.posService.updateQty('${item.product_id}', -1)">−</button>
          <span class="cart-qty-val mono">${item.quantity}</span>
          <button class="cart-qty-btn" onclick="window.posService.updateQty('${item.product_id}', 1)">+</button>
        </div>
        <div class="cart-item-subtotal mono">
          ₵${item.subtotal_revenue.toFixed(2)}
        </div>
      </div>
    `).join('');

    const totals = this.getCartTotals();
    if (totalQtyEl) totalQtyEl.textContent = `${totals.totalQty} item${totals.totalQty > 1 ? 's' : ''}`;
    if (totalAmountEl) totalAmountEl.textContent = `₵${totals.totalRevenue.toFixed(2)}`;
  }

  async renderMyShiftSales() {
    const container = document.getElementById('myShiftSalesTable');
    if (!container) return;

    const user = window.authService.getUser();
    if (!user) return;

    const allSales = await window.dataService.getSales();
    const today = new Date().toISOString().slice(0, 10);

    // Filter sales by current user for today
    const mySales = allSales.filter(s => {
      const saleDate = new Date(s.created_at).toISOString().slice(0, 10);
      const isMe = s.salesperson_id === user.id || s.salesperson_name === user.full_name;
      return saleDate === today && isMe;
    });

    const shiftTotal = mySales.reduce((sum, s) => sum + Number(s.total_revenue), 0);
    const shiftTotalEl = document.getElementById('myShiftTotalRevenue');
    if (shiftTotalEl) shiftTotalEl.textContent = `₵${shiftTotal.toFixed(2)}`;

    if (mySales.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h4>No sales completed yet today</h4>
          <p>Your processed orders for today's shift will appear here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Payment</th>
              <th>Total Revenue</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            ${mySales.map(s => `
              <tr>
                <td class="mono">${new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>${s.customer_name || 'Walk-in'}</td>
                <td>${s.items ? s.items.reduce((acc, i) => acc + i.quantity, 0) : 0} items</td>
                <td><span class="badge badge-info" style="text-transform:uppercase;">${s.payment_method}</span></td>
                <td class="mono" style="font-weight:700; color:var(--primary);">₵${Number(s.total_revenue).toFixed(2)}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick='window.posService.showReceiptModal(${JSON.stringify(s).replace(/'/g, "&apos;")})'>
                    🧾 View
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  render() {
    this.renderCategoryPills();
    this.renderProductGrid();
    this.renderCart();
    this.renderMyShiftSales();
  }
}

window.posService = new PosService();
