/** @type {import('tailwindcss').Config} */

// Every shade is piped through a CSS custom property so the whole app can be
// re-skinned at runtime (see index.css `:root` vs `[data-theme="kid"]`)
// just by flipping the `data-theme` attribute on <html> — no component
// changes needed. Tailwind's `<alpha-value>` placeholder still works because
// each var holds a "r g b" triplet, not a hex string.
function themeColor(name) {
  return {
    DEFAULT: `rgb(var(--color-${name}) / <alpha-value>)`,
    50: `rgb(var(--color-${name}-50) / <alpha-value>)`,
    100: `rgb(var(--color-${name}-100) / <alpha-value>)`,
    200: `rgb(var(--color-${name}-200) / <alpha-value>)`,
    300: `rgb(var(--color-${name}-300) / <alpha-value>)`,
    400: `rgb(var(--color-${name}-400) / <alpha-value>)`,
    500: `rgb(var(--color-${name}-500) / <alpha-value>)`,
    600: `rgb(var(--color-${name}-600) / <alpha-value>)`,
    700: `rgb(var(--color-${name}-700) / <alpha-value>)`,
    800: `rgb(var(--color-${name}-800) / <alpha-value>)`,
    900: `rgb(var(--color-${name}-900) / <alpha-value>)`,
  };
}

export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: themeColor("navy"),
        gold: themeColor("gold"),
        cream: themeColor("cream"),
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Arial", "Helvetica", "sans-serif"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        xl2: "var(--radius-xl2)",
      },
      transitionTimingFunction: {
        bouncy: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
}
