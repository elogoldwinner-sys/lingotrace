/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0d1b2a",
          50: "#eef2f5",
          100: "#d3dce3",
          200: "#a8bcca",
          300: "#7c9bb0",
          400: "#4f7996",
          500: "#2c5978",
          600: "#1c3d54",
          700: "#152e40",
          800: "#0d1b2a",
          900: "#080f19",
        },
        gold: {
          DEFAULT: "#c9993f",
          50: "#fdf8ef",
          100: "#f9edd4",
          200: "#f0d9a5",
          300: "#e6c476",
          400: "#dcae4d",
          500: "#c9993f",
          600: "#a97a2e",
          700: "#875f26",
          800: "#6d4c22",
          900: "#5b401f",
        },
        cream: {
          DEFAULT: "#faf6ef",
          100: "#fffdf9",
          200: "#fff9ec",
          300: "#faf6ef",
          400: "#eee2cf",
          500: "#a89f8f",
          600: "#7a7266",
        },
      },
      fontFamily: {
        serif: ["Playfair Display", "Georgia", "serif"],
        sans: ["Inter", "Arial", "Helvetica", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 24px rgba(13,27,42,0.08)",
      },
      borderRadius: {
        xl2: "16px",
      },
    },
  },
  plugins: [],
}
