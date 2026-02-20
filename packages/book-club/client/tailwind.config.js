/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#fdfaf5',
          100: '#faf4e8',
          200: '#f5e8d0',
          300: '#edcfa8',
        },
        navy: {
          800: '#1e2a3a',
          900: '#141f2e',
        },
        terracotta: {
          400: '#c4735a',
          500: '#b5603f',
          600: '#9e4f33',
        },
        sage: {
          400: '#7a9e7e',
          500: '#648768',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Merriweather', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

