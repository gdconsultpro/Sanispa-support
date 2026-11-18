import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sanispa: {
          navy: "#0A2342",
          blue: "#096A80",
          ice: "#F0F8F8",
          line: "#D1E4E7",
          steel: "#5B6776",
        },
      },
      boxShadow: {
        soft: "0 14px 40px rgba(10, 35, 66, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
