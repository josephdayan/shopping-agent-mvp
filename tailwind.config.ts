import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A2E2B",
        mist: "#E6F5F1",
        leaf: "#28FEE5",
        coral: "#E2614C",
        gold: "#E6B34C",
        lia: {
          aqua: "#28FEE5",
          night: "#0F3D3A",
          ink: "#0A2E2B",
          deep: "#082523",
          green: "#0E8C7E",
          mint: "#E6F5F1",
          lavender: "#E6F5F1",
          line: "#CFE8E2",
          muted: "#5E7672",
          body: "#3C534F",
          success: "#2FA46B",
          warning: "#E6B34C",
          danger: "#E2614C",
          paper: "#FFFFFF"
        }
      },
      boxShadow: {
        soft: "0 24px 60px rgba(15, 61, 58, 0.10)",
        brand: "0 28px 80px -36px rgba(15, 61, 58, 0.55)"
      }
    }
  },
  plugins: []
};

export default config;
