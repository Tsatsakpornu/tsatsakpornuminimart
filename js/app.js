/**
 * TSATSAKPORNU POS - MAIN APPLICATION CONTROLLER
 * Coordinates UI navigation, view state, modal manager, notifications, and Supabase config.
 */

class AppController {
  constructor() {
    this.currentView = 'pos';
    this.authMode = 'signin'; // 'signin' or 'signup'
    this.authSelectedRole = 'salesperson'; // 'salesperson' or 'admin'
    this.mobileNavOpen = false;
  }

  async init() {
    console.log('🚀 Initializing TSATSAKPORNU POS...');

    // Initialize Supabase client
    const initResult = await window.dataService.initClient();
    this.updateCloudStatusBadge(initResult);

    // Bind Auth state listener
    window.authService.onAuthStateChanged((user) => {
      this.handleAuthState(user);
    });

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });

    // Close mobile nav when clicking outside header
    document.addEventListener('click', (e) => {
      if (this.mobileNavOpen && !e.target.closest('#appHeader')) {
        this.mobileNavOpen = false;
        this.updateMobileNav();
      }
    });
  }

  updateCloudStatusBadge(status) {
    const badge = document.getElementById('cloudStatusChip');
    const dot = document.getElementById('cloudStatusDot');
    const text = document.getElementById('cloudStatusText');

    if (!badge || !dot || !text) return;

    if (window.dataService.isConnected) {
      dot.className = 'status-dot';
      text.textContent = 'Supabase Cloud: Live';
      badge.title = 'Connected to your Supabase PostgreSQL cloud backend';
    } else {
      dot.className = 'status-dot offline';
      text.textContent = 'Local / Demo Mode';
      badge.title = 'Running locally. Click to connect to Supabase Cloud';
    }
  }

  handleAuthState(user) {
    const authWrapper = document.getElementById('authView');
    const appHeader = document.getElementById('appHeader');
    const appMain = document.getElementById('appMain');
    const userBadge = document.getElementById('headerUserBadge');
    const userName = document.getElementById('headerUserName');
    const userRole = document.getElementById('headerUserRole');
    const userAvatar = document.getElementById('headerUserAvatar');

    if (!user) {
      // Show Auth Screen
      if (authWrapper) authWrapper.style.display = 'flex';
      if (appHeader) appHeader.style.display = 'none';
      if (appMain) appMain.style.display = 'none';
      this.renderAuthScreen();
      return;
    }

    // User is logged in
    if (authWrapper) authWrapper.style.display = 'none';
    if (appHeader) appHeader.style.display = 'block';
    if (appMain) appMain.style.display = 'block';

    // Populate user profile in header
    if (userName) userName.textContent = user.full_name || user.email;
    if (userRole) {
      userRole.textContent = user.role.toUpperCase();
      userRole.className = 'user-role-tag' + (user.role === 'admin' ? ' role-admin' : ' role-sales');
    }
    if (userAvatar) userAvatar.textContent = (user.full_name || user.email).slice(0, 1).toUpperCase();

    // Toggle navigation tab visibility based on Role
    const adminTabs = document.querySelectorAll('.admin-only-tab');
    adminTabs.forEach(tab => {
      tab.style.display = user.role === 'admin' ? 'flex' : 'none';
    });

    // Default route
    if (user.role === 'admin') {
      this.navigate('admin-overview');
    } else {
      this.navigate('pos');
    }

    // Close mobile nav if open
    this.mobileNavOpen = false;
    this.updateMobileNav();

    // Refresh data
    window.posService.init();
    if (user.role === 'admin') {
      window.adminService.init();
    }
  }

  navigate(viewId) {
    this.currentView = viewId;

    // Update tab styles
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewId);
    });

    // Update view panels
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${viewId}`);
    });

    // Close mobile nav after navigating
    this.mobileNavOpen = false;
    this.updateMobileNav();

    // Render corresponding view
    if (viewId === 'pos') {
      window.posService.render();
    } else if (viewId.startsWith('admin-')) {
      window.adminService.refresh();
    }
  }

  /* ================= AUTH UI HANDLING ================= */
  setAuthMode(mode) {
    this.authMode = mode;
    this.renderAuthScreen();
  }

  setAuthRole(role) {
    this.authSelectedRole = role;
    document.querySelectorAll('.role-switcher button').forEach(b => {
      b.classList.toggle('active', b.dataset.role === role);
    });
  }

  renderAuthScreen() {
    const container = document.getElementById('authCardContent');
    if (!container) return;

    container.innerHTML = `
      <div class="auth-header">
        <div class="auth-logo-wrap">
          <img src="assets/logo.jpg" alt="Tsatsakpornu Logo" class="auth-logo-img">
        </div>
        <h2>TSATSAKPORNU</h2>
        <div class="tagline" style="font-size:12px; color:var(--muted); font-weight:600; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.04em;">Trading Enterprise</div>
        <p style="margin-top:2px;">Sign in to access your POS & Management terminal</p>
      </div>

      <form id="authForm" onsubmit="return window.app.handleAuthSubmit(event)">
        <div class="field">
          <label>Email Address</label>
          <input type="email" id="authEmail" required placeholder="Enter your email" autocomplete="username">
        </div>

        <div class="field">
          <label>Password</label>
          <input type="password" id="authPassword" required placeholder="Enter your password" autocomplete="current-password">
        </div>

        <button type="submit" id="authSubmitBtn" class="btn btn-primary btn-block btn-lg" style="margin-top: 18px;">
          Sign In
        </button>
      </form>
    `;
  }

  async handleAuthSubmit(ev) {
    ev.preventDefault();

    const submitBtn = document.getElementById('authSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Signing in...';
    }

    const email = document.getElementById('authEmail')?.value || '';
    const password = document.getElementById('authPassword')?.value || '';

    const res = await window.authService.signIn(email, password);
    if (!res.success) {
      this.showToast(res.error || 'Invalid email or password', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    } else {
      this.showToast(`Welcome back, ${res.user.full_name}!`, 'success');
    }

    return false;
  }

  demoLogin(roleType, personIndex) {
    const user = window.authService.demoLogin(roleType, personIndex);
    this.showToast(`Welcome, ${user.full_name}! Logged in as ${user.role.toUpperCase()}`, 'success');
  }

  logout() {
    window.authService.signOut();
    this.showToast('You have been logged out', 'info');
  }

  /* ================= MOBILE NAV TOGGLE ================= */
  toggleMobileNav() {
    this.mobileNavOpen = !this.mobileNavOpen;
    this.updateMobileNav();
  }

  updateMobileNav() {
    const navTabs = document.getElementById('navTabs');
    const hamburger = document.getElementById('mobileMenuBtn');
    if (navTabs) {
      navTabs.classList.toggle('mobile-open', this.mobileNavOpen);
    }
    if (hamburger) {
      hamburger.classList.toggle('active', this.mobileNavOpen);
    }
  }

  /* ================= SUPABASE CONFIG MODAL ================= */
  openSupabaseSettings() {
    const creds = window.dataService.getCredentials();
    const isConn = window.dataService.isConnected;

    const modalHtml = `
      <div>
        <p style="color:var(--muted); font-size:13px; margin-bottom:16px;">
          Connect your POS directly to your live <strong>Supabase</strong> PostgreSQL database for real-time cloud data, multi-device syncing, and secure Supabase Auth.
        </p>

        <div style="background:var(--surface-alt); padding:12px 14px; border-radius:var(--radius-md); border:1px solid var(--line); margin-bottom:16px; display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="${isConn ? 'status-dot' : 'status-dot offline'}"></div>
            <strong>${isConn ? 'Connected to Supabase Cloud' : 'Running in Local Demo Mode'}</strong>
          </div>
          <span class="badge ${isConn ? 'badge-success' : 'badge-warning'}">${isConn ? 'ACTIVE' : 'LOCAL'}</span>
        </div>

        <form onsubmit="return window.app.saveSupabaseConfig(event)">
          <div class="field">
            <label>Supabase Project URL</label>
            <input type="url" id="sbUrlInput" placeholder="https://xyzcompany.supabase.co" value="${creds.url}">
            <div class="hint">Found in Supabase Dashboard → Settings → API</div>
          </div>

          <div class="field">
            <label>Supabase Anon / Public API Key</label>
            <input type="password" id="sbKeyInput" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." value="${creds.key}">
            <div class="hint">Found in Supabase Dashboard → Settings → API → anon public key</div>
          </div>

          <div style="display:flex; gap:10px; margin-top:20px;">
            <button type="submit" class="btn btn-primary btn-block">Save & Connect</button>
            <button type="button" class="btn btn-ghost" onclick="window.app.testSupabaseConnection()">Test</button>
          </div>
        </form>

        <div style="margin-top:24px; padding-top:16px; border-top:1px dashed var(--line);">
          <div style="font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:6px;">
            Need Database Schema?
          </div>
          <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">
            Run the SQL script in your Supabase SQL Editor to create tables for products, sales, sale_items, profiles, and cost profit tracking.
          </p>
          <button type="button" class="btn btn-accent btn-sm" onclick="window.app.copySqlSchema()">
            📋 Copy Supabase SQL Setup Script
          </button>
        </div>
      </div>
    `;

    this.openModal('Supabase Backend Settings', modalHtml);
  }

  async saveSupabaseConfig(ev) {
    ev.preventDefault();
    const url = document.getElementById('sbUrlInput').value;
    const key = document.getElementById('sbKeyInput').value;

    const res = await window.dataService.setCredentials(url, key);
    this.updateCloudStatusBadge(res);

    if (res.success && res.mode === 'cloud') {
      this.showToast('Connected to Supabase cloud successfully!', 'success');
      this.closeModal();
      window.posService.init();
      window.adminService.refresh();
    } else if (res.mode === 'local') {
      this.showToast('Config saved (Switched to Local Mode)', 'info');
      this.closeModal();
    } else {
      this.showToast(`Connection failed: ${res.error}`, 'error');
    }

    return false;
  }

  async testSupabaseConnection() {
    const url = document.getElementById('sbUrlInput').value;
    const key = document.getElementById('sbKeyInput').value;

    if (!url || !key) {
      this.showToast('Please enter both Supabase URL and Anon Key', 'error');
      return;
    }

    this.showToast('Testing Supabase connection...', 'info');
    const res = await window.dataService.setCredentials(url, key);
    if (res.success && res.mode === 'cloud') {
      this.showToast('✅ Supabase connected successfully!', 'success');
    } else {
      this.showToast(`❌ Failed: ${res.error || 'Could not reach Supabase tables'}`, 'error');
    }
  }

  copySqlSchema() {
    const sql = `-- TSATSAKPORNU POS SUPABASE SCHEMA
create extension if not exists "uuid-ossp";

-- Profiles table
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  role text not null check (role in ('admin', 'salesperson')),
  created_at timestamptz default now() not null
);

-- Products table
create table if not exists public.products (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  category text default 'General' not null,
  cost_price numeric(12,2) not null check (cost_price >= 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  stock integer default 0 not null check (stock >= 0),
  min_stock_alert integer default 5 not null,
  sku text,
  image_url text,
  created_at timestamptz default now() not null
);

-- Sales table
create table if not exists public.sales (
  id uuid default uuid_generate_v4() primary key,
  salesperson_id uuid references public.profiles(id) on delete set null,
  salesperson_name text not null,
  customer_name text default 'Walk-in Customer',
  customer_phone text,
  total_revenue numeric(12,2) not null,
  total_cost numeric(12,2) not null,
  net_profit numeric(12,2) not null,
  payment_method text not null,
  created_at timestamptz default now() not null
);

-- Sale items table
create table if not exists public.sale_items (
  id uuid default uuid_generate_v4() primary key,
  sale_id uuid references public.sales(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null,
  cost_price numeric(12,2) not null,
  selling_price numeric(12,2) not null,
  subtotal_revenue numeric(12,2) not null,
  subtotal_cost numeric(12,2) not null,
  subtotal_profit numeric(12,2) not null
);

-- Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

create policy "Allow read profiles" on public.profiles for select using (true);
create policy "Allow read products" on public.products for select using (true);
create policy "Allow insert sales" on public.sales for insert with check (true);
create policy "Allow read sales" on public.sales for select using (true);
create policy "Allow insert sale_items" on public.sale_items for insert with check (true);
create policy "Allow read sale_items" on public.sale_items for select using (true);

-- Supabase Storage Bucket for Product Images
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public Access Product Images" on storage.objects;
create policy "Public Access Product Images" on storage.objects for select using (bucket_id = 'product-images');

drop policy if exists "Allow Upload Product Images" on storage.objects;
create policy "Allow Upload Product Images" on storage.objects for insert with check (bucket_id = 'product-images');
`;

    navigator.clipboard.writeText(sql).then(() => {
      this.showToast('📋 SQL setup script copied to clipboard!', 'success');
    }).catch(() => {
      this.showToast('Could not access clipboard. Please check supabase_schema.sql', 'error');
    });
  }

  /* ================= MODAL & TOAST MANAGERS ================= */
  openModal(title, htmlContent) {
    const modalEl = document.getElementById('globalModal');
    const titleEl = document.getElementById('globalModalTitle');
    const bodyEl = document.getElementById('globalModalBody');

    if (!modalEl || !titleEl || !bodyEl) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = htmlContent;
    modalEl.classList.add('show');
  }

  closeModal() {
    const modalEl = document.getElementById('globalModal');
    if (modalEl) modalEl.classList.remove('show');
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }
}

window.app = new AppController();

// Boot application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
