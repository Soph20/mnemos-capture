import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#0B1120",
          blue: "#2E5A9A",
          cyan: "#3EB0EA",
          silver: "#E4EDF6",
          cream: "#E4EDF6",
        },
      },
    },
  },
  plugins: [],
};

export default config;
