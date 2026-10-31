/** @type {import('tailwindcss').Config} */
export default {
  // hover: styles only on devices that can hover, so a tap on iPhone
  // doesn't leave a button highlighted.
  future: { hoverOnlyWhenSupported: true },
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        heading: ['Geist', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'system-ui', 'sans-serif']
      },
      colors: {
        divider: '#2a2a2e',
        secondary: '#9a9a9f',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)'
      }
    }
  },
  plugins: []
}
