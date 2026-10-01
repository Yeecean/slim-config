/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        apple: {
          bg: '#f8fafc',
          card: 'rgba(255, 255, 255, 0.7)',
          accent: '#3b82f6',
          text: '#0f172a',
          secondary: '#64748b',
          border: 'rgba(255, 255, 255, 0.5)',
          danger: '#ef4444',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow': 'conic-gradient(from 180deg at 50% 50%, #2a8af6 0deg, #a853ba 180deg, #e92a67 360deg)',
      },
      borderRadius: {
        'btn': '12px',
        'card': '24px',
        'modal': '32px',
      },
      boxShadow: {
        'apple-sm': '0 4px 24px rgba(0,0,0,0.02)',
        'apple-md': '0 12px 48px rgba(0,0,0,0.05)',
        'apple-lg': '0 24px 80px rgba(0,0,0,0.07)',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
      },
      fontFamily: {
        apple: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        'glass': '20px',
      },
      animation: {
        'blob': 'blob 7s infinite',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        blob: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      },
      spacing: {
        '4.5': '1.125rem',
        '9.5': '2.375rem',
      }
    },
  },
  plugins: [],
}

