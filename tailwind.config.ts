import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "#F4F1EB",
          white: "#FFFFFF",
        },
        forest: "#1B4332",
        sage: "#40916C",
        "sage-light": "#D8F3DC",
        amber: "#B7791F",
        "amber-light": "#FEF3C7",
        ink: "#161210",
        "ink-light": "#5C5550",
        "ink-faint": "#A09890",
        border: "#E2DDD6",
        primary: {
          DEFAULT: "#1B4332",
          hover: "#152E24",
        },
        accent: {
          DEFAULT: "#40916C",
          light: "#D8F3DC",
        },
        danger: "#DC2626",
        warning: "#B7791F",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
