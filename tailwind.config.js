/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './frontend/index.html',
    './frontend/js/**/*.js'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        darkBg: '#020b18',
        emeraldGreen: '#00d4ff',
        skyBlue: '#00e5a0',
        glassBg: 'rgba(0, 20, 50, 0.45)',
        glassBorder: 'rgba(0, 212, 255, 0.18)'
      },
      fontFamily: {
        sans: ['Exo 2', 'Inter', 'sans-serif'],
        display: ['Rajdhani', 'Exo 2', 'sans-serif']
      },
      scale: {
        102: '1.02'
      }
    }
  },
  plugins: []
};
