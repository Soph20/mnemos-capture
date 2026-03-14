import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#0F162F",
          blue: "#2A62C6",
          gold: "#D2A657",
          "pale-gold": "#E0D4B6",
          cream: "#FFFCEB",
        },
      },
    },
  },
  plugins: [],
};

export default config;
