/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f0ff',
          100: '#e0e0ff',
          500: '#3434ef',
          600: '#2a2ad4',
          700: '#1f1fb8',
          900: '#0f0f7a',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
