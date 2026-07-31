import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111111",
        paper: "#f6f2ea",
        rust: "#b6512c",
        pine: "#20413a",
        sand: "#dcc9ac"
      },
      fontFamily: {
        sans: ["'Avenir Next'", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Iowan Old Style", "Georgia", "ui-serif", "serif"]
      },
      boxShadow: {
        panel: "0 24px 80px rgba(17, 17, 17, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
