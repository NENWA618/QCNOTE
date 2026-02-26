/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '1rem',
          md: '2rem',
          lg: '3rem',
          xl: '4rem',
        },
      },
      colors: {
        // 自定义调色板
        'primary-light': '#f6e0e7',
        'primary-medium': '#d8cbcf',
        'primary-dark': '#c8b8c8',
        'accent-pink': '#dc96b4',
        'accent-purple': '#b0a8c0',
        'text-light': '#5c5c5c',  // slightly darker for better contrast
      },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
        '6xl': '3.75rem',
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
        '3xl': '4rem',
        '4xl': '6rem',
      },
      borderRadius: {
        sm: '0.5rem',
        md: '0.8rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '2rem',
      },
      boxShadow: {
        light: '0 4px 12px rgba(200, 180, 210, 0.15)',
        medium: '0 8px 25px rgba(200, 180, 210, 0.25)',
        dark: '0 12px 35px rgba(200, 180, 210, 0.35)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease',
        'fade-in-down': 'fadeInDown 0.8s ease',
        'fade-in-up': 'fadeInUp 0.8s ease',
        'heart-beat': 'heartBeat 0.3s ease',
        'slide-in': 'slideIn 0.3s ease',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeInDown: {
          from: { opacity: '0', transform: 'translateY(-30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        heartBeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '25%': { transform: 'scale(1.2)' },
          '50%': { transform: 'scale(1.15)' },
        },
        slideIn: {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
      },
      backdropFilter: {
        blur: 'blur(10px)',
      },
    },
  },
  plugins: [],
};
