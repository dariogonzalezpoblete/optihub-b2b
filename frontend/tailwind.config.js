/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        stone: {
          bg: "#F7F6F2",
          border: "#E5E4DF",
          subtle: "#FAF9F6",
          dark: "#2A2825",
        },
        obsidian: {
          DEFAULT: "#111111",
          muted: "#242424",
          soft: "#3A3936",
          light: "#575551",
        },
        champagne: {
          DEFAULT: "#B89768",
          light: "#C9AD82",
          dark: "#9E7D4F",
          tint: "#F7F3EB",
          subtle: "rgba(184, 151, 104, 0.12)",
        },
        alabaster: "#F7F6F2",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Cormorant Garamond", "Georgia", "serif"],
        editorial: ["var(--font-serif)", "Cormorant Garamond", "Georgia", "serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
        tech: ["var(--font-mono)", "JetBrains Mono", "monospace"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
