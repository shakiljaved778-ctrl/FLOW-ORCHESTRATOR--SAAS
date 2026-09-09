import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // White-label defaults; overridden per-organization at runtime via CSS vars.
        brand: {
          DEFAULT: "var(--brand-color, #0f172a)",
          fg: "var(--brand-fg, #ffffff)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
