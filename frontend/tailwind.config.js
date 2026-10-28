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
        alabaster: "#FAF9F6",
        stone: {
          bg: "#FAF9F6",
          surface: "#F4F2ED",
          border: "#E6E2DD",
          subtle: "#FAF9F6",
          dark: "#2A2825",
        },
        obsidian: {
          DEFAULT: "#0F0F0F",
          muted: "#262626",
          soft: "#3A3936",
          light: "#5C5A55",
        },
        champagne: {
          DEFAULT: "#9E8256",
          light: "#B89B6C",
          dark: "#846C44",
          tint: "#F7F3EB",
          subtle: "rgba(158, 130, 86, 0.12)",
        },
        bronze: {
          DEFAULT: "#9E8256",
          light: "#B89B6C",
          dark: "#846C44",
        },
        hairline: "#E6E2DD",
        graphite: "#5C5A55",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Cormorant Garamond", "Georgia", "serif"],
        editorial: ["var(--font-serif)", "Cormorant Garamond", "Georgia", "serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
        tech: ["var(--font-mono)", "JetBrains Mono", "monospace"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        none: "0px",
        sm: "2px",
        DEFAULT: "2px",
        md: "2px",
        lg: "2px",
        xl: "2px",
        "2xl": "2px",
        "3xl": "2px",
        "4xl": "2px",
      },
    },
  },
  plugins: [],
};
