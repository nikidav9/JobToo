/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#FF6B1A',
        sidebar: '#0F172A',
      },
    },
  },
  plugins: [],
}
