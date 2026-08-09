import type { Config } from "tailwindcss";

// Tailwind is used for layout and spacing utilities only. The design system
// itself (colors, sketchy border radii, sticker shadows) lives in the `:root`
// custom properties in globals.css and is applied through hand-written classes
// there, so there is deliberately no theme mirror here: a second copy of the
// palette only ever drifted out of sync with the first.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
