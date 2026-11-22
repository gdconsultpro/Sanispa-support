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
          navy: "rgb(var(--sanispa-navy) / <alpha-value>)",
          blue: "rgb(var(--sanispa-blue) / <alpha-value>)",
          ice: "rgb(var(--sanispa-ice) / <alpha-value>)",
          line: "rgb(var(--sanispa-line) / <alpha-value>)",
          steel: "rgb(var(--sanispa-steel) / <alpha-value>)",
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
