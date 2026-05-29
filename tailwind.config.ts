import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f0ebe0",
        cream: "#faf7ef",
        ink: "#20201e",
        rayner: "#2f4fe0",
        "rayner-soft": "#e1e6fd",
        ada: "#ef5a6b",
        "ada-soft": "#fcdfe2",
        hi: "#ffe066",
        live: "#ff3b30",
        muted: "#8a857a",
      },
      fontFamily: {
        hand: ['"Shantell Sans"', "system-ui", "sans-serif"],
        scribble: ['"Caveat"', "cursive"],
      },
      boxShadow: {
        sticker: "4px 4px 0 #20201e",
        "sticker-sm": "3px 3px 0 #20201e",
        "sticker-lg": "5px 6px 0 #20201e",
        "sticker-phone": "10px 12px 0 rgba(32,32,30,0.18)",
      },
    },
  },
  plugins: [],
};
export default config;
