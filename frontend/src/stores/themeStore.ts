import { create } from 'zustand';

type ThemeMode = 'light' | 'dark';
type BgTheme = 'parchment' | 'white' | 'green' | 'dark-gray' | 'dark-black';

interface ThemeState {
  mode: ThemeMode;
  bgTheme: BgTheme;
  fontSize: number;
  lineHeight: number;
  letterSpacing: string;
  marginWidth: string;
  fontFamily: string;
  pageMode: 'scroll' | 'pagination' | 'swipe';

  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setBgTheme: (bg: BgTheme) => void;
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  setLetterSpacing: (spacing: string) => void;
  setMarginWidth: (margin: string) => void;
  setFontFamily: (font: string) => void;
  setPageMode: (mode: 'scroll' | 'pagination' | 'swipe') => void;
}

function getInitialTheme(): ThemeMode {
  const stored = localStorage.getItem('theme-mode');
  if (stored === 'dark' || stored === 'light') return stored;
  // Auto-detect from system
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  // Check time
  const hour = new Date().getHours();
  if (hour >= 20 || hour < 6) return 'dark';
  return 'light';
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: getInitialTheme(),
  bgTheme: (localStorage.getItem('bg-theme') as BgTheme) || 'parchment',
  fontSize: Number(localStorage.getItem('font-size')) || 16,
  lineHeight: Number(localStorage.getItem('line-height')) || 1.8,
  letterSpacing: localStorage.getItem('letter-spacing') || 'normal',
  marginWidth: localStorage.getItem('margin-width') || 'medium',
  fontFamily: localStorage.getItem('font-family') || 'system',
  pageMode: (localStorage.getItem('page-mode') as 'scroll' | 'pagination' | 'swipe') || 'scroll',

  setMode: (mode) => {
    localStorage.setItem('theme-mode', mode);
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ mode });
  },

  toggleMode: () => {
    set((state) => {
      const newMode = state.mode === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme-mode', newMode);
      if (newMode === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { mode: newMode };
    });
  },

  setBgTheme: (bg) => { localStorage.setItem('bg-theme', bg); set({ bgTheme: bg }); },
  setFontSize: (size) => { localStorage.setItem('font-size', String(size)); set({ fontSize: size }); },
  setLineHeight: (height) => { localStorage.setItem('line-height', String(height)); set({ lineHeight: height }); },
  setLetterSpacing: (spacing) => { localStorage.setItem('letter-spacing', spacing); set({ letterSpacing: spacing }); },
  setMarginWidth: (margin) => { localStorage.setItem('margin-width', margin); set({ marginWidth: margin }); },
  setFontFamily: (font) => { localStorage.setItem('font-family', font); set({ fontFamily: font }); },
  setPageMode: (mode) => { localStorage.setItem('page-mode', mode); set({ pageMode: mode }); },
}));

// Initialize theme on load
const initialMode = getInitialTheme();
if (initialMode === 'dark') {
  document.documentElement.classList.add('dark');
}
