/**
 * TSATSAKPORNU POS - AUTHENTICATION & ROLE MANAGEMENT MODULE
 * Manages Supabase Auth, role-based permissions, demo accounts, and session state.
 */

const DEMO_USERS = {
  admin: {
    id: 'user-admin-1',
    email: 'admin@tsatsakpornu.shop',
    full_name: 'Augustus Sey (Owner)',
    role: 'admin'
  },
  salesperson1: {
    id: 'user-sales-1',
    email: 'erica@tsatsakpornu.shop',
    full_name: 'Erica Dansu',
    role: 'salesperson'
  },
  salesperson2: {
    id: 'user-sales-2',
    email: 'ama@tsatsakpornu.shop',
    full_name: 'Ama Serwaa',
    role: 'salesperson'
  }
};

class AuthService {
  constructor() {
    this.currentUser = null;
    this.authListeners = [];
    this.initSession();
  }

  initSession() {
    const saved = localStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
        if (this.currentUser && this.currentUser.role === 'admin' && (this.currentUser.full_name?.includes('Kwesi') || !this.currentUser.full_name)) {
          this.currentUser.full_name = 'Augustus Sey (Owner)';
          this.currentUser.email = 'admin@tsatsakpornu.shop';
          this.saveSession(this.currentUser);
        } else if (this.currentUser && this.currentUser.role === 'salesperson' && this.currentUser.full_name?.includes('Kofi')) {
          this.currentUser.full_name = 'Erica Dansu';
          this.currentUser.email = 'erica@tsatsakpornu.shop';
          this.saveSession(this.currentUser);
        }
      } catch (e) {
        this.currentUser = null;
      }
    }
  }

  onAuthStateChanged(callback) {
    this.authListeners.push(callback);
    callback(this.currentUser);
  }

  notifyListeners() {
    for (const cb of this.authListeners) {
      cb(this.currentUser);
    }
  }

  saveSession(user) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    }
    this.notifyListeners();
  }

  async signIn(email, password) {
    email = (email || '').trim().toLowerCase();

    // Check if connected to Supabase Cloud Auth
    if (window.dataService && window.dataService.isConnected && window.dataService.client) {
      try {
        const { data, error } = await window.dataService.client.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        
        // Fetch role from profile table or user metadata
        let role = data.user.user_metadata?.role || 'salesperson';
        let fullName = data.user.user_metadata?.full_name || email.split('@')[0];

        try {
          const { data: profile } = await window.dataService.client
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
          if (profile) {
            role = profile.role || role;
            fullName = profile.full_name || fullName;
          }
        } catch (pe) {
          console.warn('Could not fetch profile:', pe);
        }

        const user = {
          id: data.user.id,
          email: data.user.email,
          full_name: fullName,
          role: role,
          token: data.session.access_token
        };

        this.saveSession(user);
        return { success: true, user };
      } catch (err) {
        console.error('Supabase Auth error:', err);
        return { success: false, error: err.message || 'Login failed' };
      }
    }

    // Local / Offline demo authentication
    if (email.includes('admin')) {
      const user = { ...DEMO_USERS.admin, email };
      this.saveSession(user);
      return { success: true, user };
    } else if (email.includes('erica') || email.includes('kofi')) {
      const user = { ...DEMO_USERS.salesperson1, email };
      this.saveSession(user);
      return { success: true, user };
    } else if (email.includes('ama')) {
      const user = { ...DEMO_USERS.salesperson2, email };
      this.saveSession(user);
      return { success: true, user };
    } else {
      const user = {
        id: 'user-' + Date.now().toString(36),
        email,
        full_name: email.split('@')[0].toUpperCase(),
        role: 'salesperson'
      };
      this.saveSession(user);
      return { success: true, user };
    }
  }

  async signUp(email, password, fullName, role) {
    email = (email || '').trim().toLowerCase();
    fullName = (fullName || '').trim() || email.split('@')[0];
    role = role === 'admin' ? 'admin' : 'salesperson';

    if (window.dataService && window.dataService.isConnected && window.dataService.client) {
      try {
        const { data, error } = await window.dataService.client.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: role
            }
          }
        });
        if (error) throw error;

        const user = {
          id: data.user?.id || 'user-' + Date.now().toString(36),
          email,
          full_name: fullName,
          role: role
        };
        this.saveSession(user);
        return { success: true, user };
      } catch (err) {
        console.error('Supabase SignUp error:', err);
        return { success: false, error: err.message || 'Sign up failed' };
      }
    }

    // Local / Demo registration
    const user = {
      id: 'user-' + Date.now().toString(36),
      email,
      full_name: fullName,
      role: role
    };
    this.saveSession(user);
    return { success: true, user };
  }

  demoLogin(roleType = 'admin', personIndex = 1) {
    let user;
    if (roleType === 'admin') {
      user = DEMO_USERS.admin;
    } else {
      user = personIndex === 2 ? DEMO_USERS.salesperson2 : DEMO_USERS.salesperson1;
    }
    this.saveSession(user);
    return user;
  }

  async signOut() {
    if (window.dataService && window.dataService.isConnected && window.dataService.client) {
      try {
        await window.dataService.client.auth.signOut();
      } catch (e) {
        console.error('SignOut error:', e);
      }
    }
    this.saveSession(null);
  }

  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  }

  isSalesperson() {
    return this.currentUser && this.currentUser.role === 'salesperson';
  }

  getUser() {
    return this.currentUser;
  }
}

window.authService = new AuthService();
