/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff9ed',
          100: '#fff0cf',
          200: '#ffd87f',
          300: '#f8bf33',
          400: '#f1a613',
          500: '#d88808',
          600: '#bc6b04',
          700: '#975004',
          800: '#7b4109',
          900: '#66370c',
        },
      },
      boxShadow: {
        soft: '0 10px 35px -15px rgba(15, 23, 42, 0.35)',
      },
    },
  },
  plugins: [],
};
