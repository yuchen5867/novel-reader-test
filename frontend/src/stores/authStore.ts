import { create } from 'zustand';
import { login as apiLogin } from '../utils/api';

interface AuthState {
  isLoggedIn: boolean;
  username: string;
  token: string;
  loginError: string;

  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: !!localStorage.getItem('admin_token'),
  username: localStorage.getItem('admin_username') || '',
  token: localStorage.getItem('admin_token') || '',
  loginError: '',

  login: async (username, password) => {
    try {
      const res = await apiLogin(username, password);
      localStorage.setItem('admin_token', res.token);
      localStorage.setItem('admin_username', res.username);
      set({ isLoggedIn: true, username: res.username, token: res.token, loginError: '' });
      return true;
    } catch (e: any) {
      set({ loginError: e.message });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_username');
    set({ isLoggedIn: false, username: '', token: '' });
  },

  setToken: (token) => {
    set({ token });
  },
}));
