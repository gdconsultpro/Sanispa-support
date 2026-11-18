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
          navy: "#193B5B",
          blue: "#0A6ED0",
          ice: "#EEF7FD",
          line: "#D9E7F2",
          steel: "#575756",
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
