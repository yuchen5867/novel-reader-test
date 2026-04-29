/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        reader: {
          bg: '#F5F0E8',
          text: '#2C2C2C',
          dark: {
            bg: '#1A1A1A',
            text: '#B0B0B0',
            black: '#000000',
          },
          green: {
            bg: '#E8F0E8',
          }
        }
      },
      fontFamily: {
        song: ['"Noto Serif SC"', '"Source Han Serif SC"', 'serif'],
        wenkai: ['"LXGW WenKai"', '"霞鹜文楷"', 'serif'],
      },
      screens: {
        'mobile': { max: '767px' },
        'tablet': { min: '768px', max: '1024px' },
        'desktop': { min: '1025px' },
      }
    },
  },
  plugins: [],
}
