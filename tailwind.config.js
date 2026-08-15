/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#1b2a41", deep: "#0f1c2e" },
        brick: { DEFAULT: "#9c3b2e", deep: "#7a2d22" },
        paper: { DEFAULT: "#ece5d3", deep: "#e2d9c2" },
        ink: "#2a2621",
        gold: "#a8791f",
        seal: "#3f6b4a",
      },
      fontFamily: {
        display: ["'Source Serif 4'", "serif"],
        hindi: ["'Tiro Devanagari Hindi'", "serif"],
        sans: ["Inter", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
