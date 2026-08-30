import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#000820",
          blue: "#1c74d8",
          cyan: "#9dd8f5",
          silver: "#e7e7ed",
          cream: "#fcfcfc",
        },
      },
    },
  },
  plugins: [],
};

export default config;
