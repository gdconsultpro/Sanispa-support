import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        sanispa: {
          navy: "#0A2342",
          blue: "#145DA0",
          ice: "#F4F7FA",
          line: "#D8E1EA",
          steel: "#5B6776"
        }
      },
      boxShadow: {
        soft: "0 14px 40px rgba(10, 35, 66, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
