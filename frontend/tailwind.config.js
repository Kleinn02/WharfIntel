/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        wharf: {
          dark: "#010102",
          card: "#08090a",
          border: "rgba(255, 255, 255, 0.08)",
          accent: "#82a0ff",
          muted: "#8a8f98",
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}