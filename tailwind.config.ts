import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        dg: {
          black: "var(--dg-black)",
          blue: "var(--dg-blue)",
          cyan: "var(--dg-cyan)",
          green: "var(--dg-green)",
          surface: "var(--surface)",
          card: "var(--card)",
          border: "var(--border)",
          muted: "var(--muted)",
          text: "var(--text)",
        },
        /* Compat: classes teal-* passam a seguir a paleta da logo */
        teal: {
          50: "rgba(6, 182, 212, 0.08)",
          100: "rgba(6, 182, 212, 0.14)",
          200: "rgba(6, 182, 212, 0.22)",
          300: "#67e8f9",
          400: "var(--dg-cyan)",
          500: "var(--dg-cyan)",
          600: "var(--dg-cyan)",
          700: "var(--dg-blue)",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#0c1929",
        },
      },
      backgroundImage: {
        "gradient-brand": "var(--gradient-brand)",
        "gradient-brand-vertical": "var(--gradient-brand-vertical)",
        "dg-mesh": "var(--gradient-mesh)",
      },
    },
  },
  plugins: [],
};

export default config;
