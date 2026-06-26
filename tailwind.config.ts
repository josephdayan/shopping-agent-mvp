import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1A1526",
        mist: "#EEEAF8",
        leaf: "#6D5BE0",
        coral: "#E2614C",
        gold: "#E6B34C",
        atlas: {
          night: "#1A1526",
          ink: "#17131F",
          violet: "#6D5BE0",
          deep: "#4A3AA0",
          lavender: "#EEEAF8",
          line: "#DED7F2",
          muted: "#6E6691",
          body: "#4B4568",
          success: "#2FA46B",
          warning: "#E6B34C",
          danger: "#E2614C",
          paper: "#FFFFFF"
        }
      },
      boxShadow: {
        soft: "0 24px 60px rgba(36, 30, 58, 0.10)",
        brand: "0 28px 80px -36px rgba(46, 33, 96, 0.55)"
      }
    }
  },
  plugins: []
};

export default config;
