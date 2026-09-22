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
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          accent: '#6366f1',
          cyan: '#06b6d4',
          violet: '#8b5cf6',
          pink: '#ec4899',
        },
        dark: {
          950: '#08090d',
          900: '#0f1117',
          850: '#151821',
          800: '#1c202d',
          700: '#282e40',
        },
        slate: {
          750: '#242e42',
          850: '#161d2a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 12s linear infinite',
      },
    },
  },
  plugins: [],
}
