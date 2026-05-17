/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Sora", "ui-sans-serif", "sans-serif"],
        body: ["Manrope", "ui-sans-serif", "sans-serif"],
      },
      colors: {
        vault: {
          bg: "#0d0f12",
          panel: "#161b22",
          glass: "rgba(31, 39, 52, 0.55)",
          accent: "#b89f7a",
          accentMuted: "#877154",
          signal: "#70f0b8",
          warning: "#e7b75c",
          danger: "#ff6d6d",
          text: "#e8edf4",
          textDim: "#94a3b8"
        }
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(184, 159, 122, 0.35), 0 10px 35px rgba(0,0,0,0.45)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
