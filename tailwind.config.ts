import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201b",
        mist: "#eef4f1",
        leaf: "#23745c",
        coral: "#d85f4f",
        gold: "#c28b22"
      },
      boxShadow: {
        soft: "0 16px 45px rgba(23, 32, 27, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
