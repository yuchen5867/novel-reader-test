import { create } from 'zustand';

interface AccessState {
  accessToken: string | null;
  isVerified: boolean;
  checking: boolean;
  needsPassword: boolean;
  error: string;
  setAccessToken: (token: string | null) => void;
  verifyPassword: (password: string) => Promise<void>;
  checkAccess: () => Promise<void>;
  logout: () => void;
}

function getToken(): string {
  return localStorage.getItem('access_token') || '';
}

export const useAccessStore = create<AccessState>((set, get) => ({
  accessToken: getToken(),
  isVerified: false,
  checking: true,
  needsPassword: false,
  error: '',

  setAccessToken: (token) => {
    if (token) {
      localStorage.setItem('access_token', token);
    } else {
      localStorage.removeItem('access_token');
    }
    set({ accessToken: token, isVerified: !!token });
  },

  verifyPassword: async (password: string) => {
    set({ error: '' });
    const res = await fetch('/api/auth/verify-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '验证失败' }));
      set({ error: err.error || '密码错误' });
      throw new Error(err.error);
    }
    const data = await res.json();
    localStorage.setItem('access_token', data.token);
    set({ accessToken: data.token, isVerified: true, error: '' });
  },

  checkAccess: async () => {
    set({ checking: true });
    try {
      const res = await fetch('/api/auth/check-access');
      const data = await res.json();
      if (!data.needsPassword) {
        set({ needsPassword: false, isVerified: true, checking: false });
        return;
      }
      set({ needsPassword: true });

      // Check if we have a valid token
      const token = getToken();
      if (token) {
        set({ accessToken: token, isVerified: true, checking: false });
      } else {
        set({ isVerified: false, checking: false });
      }
    } catch {
      set({ checking: false, isVerified: true }); // allow access on network error
    }
  },

  logout: () => {
    localStorage.removeItem('access_token');
    set({ accessToken: null, isVerified: false });
  },
}));
