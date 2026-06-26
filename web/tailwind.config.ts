/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', '"SF Pro Display"', '"SF Pro Text"', '"Helvetica Neue"', 'sans-serif'],
      },
      colors: {
        apple: {
          blue: '#007AFF',
          'blue-hover': '#0062CC',
          text: '#1D1D1F',
          secondary: '#86868B',
          border: 'rgba(0, 0, 0, 0.1)',
        },
      },
      backdropBlur: {
        glass: '40px',
      },
      borderRadius: {
        panel: '20px',
      },
    },
  },
  plugins: [],
};
