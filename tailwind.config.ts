import type { Config } from "tailwindcss";

// Colour names are semantic and map 1:1 to the CSS variables in
// src/app/globals.css — the only file that knows what colour "signal" is.
// Do not add literal colours here; scripts/check-colors.mjs enforces it.
const hsl = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: hsl("background"),
        foreground: hsl("foreground"),
        card: { DEFAULT: hsl("card"), foreground: hsl("card-foreground") },
        raised: hsl("raised"),
        border: hsl("border"),
        input: hsl("input"),
        ring: hsl("ring"),
        // The accent as a FILL (lime in both themes, ink text on it).
        primary: { DEFAULT: hsl("primary"), foreground: hsl("primary-foreground") },
        muted: { DEFAULT: hsl("muted"), foreground: hsl("muted-foreground") },
        dim: hsl("dim"),
        accent: { DEFAULT: hsl("accent"), foreground: hsl("accent-foreground") },
        // The accent as TEXT, plus the directional / verdict family.
        // Every fg is AA on the page ground and on its own -bg tint.
        signal: {
          DEFAULT: hsl("signal"),
          bg: hsl("signal-bg"),
          long: hsl("signal-long"),
          "long-bg": hsl("signal-long-bg"),
          "long-strong": hsl("signal-long-strong"),
          short: hsl("signal-short"),
          "short-bg": hsl("signal-short-bg"),
          "short-strong": hsl("signal-short-strong"),
          neutral: hsl("signal-neutral"),
          "neutral-bg": hsl("signal-neutral-bg"),
          conflict: hsl("signal-conflict"),
          "conflict-bg": hsl("signal-conflict-bg"),
          caution: hsl("signal-caution"),
          "caution-bg": hsl("signal-caution-bg"),
          break: hsl("signal-break"),
          "break-bg": hsl("signal-break-bg"),
        },
        protocol: { DEFAULT: hsl("protocol"), bg: hsl("protocol-bg") },
        chart: {
          1: hsl("chart-1"), 2: hsl("chart-2"), 3: hsl("chart-3"), 4: hsl("chart-4"),
          5: hsl("chart-5"), 6: hsl("chart-6"), 7: hsl("chart-7"), 8: hsl("chart-8"),
        },
      },
      fontFamily: {
        // Chivo carries interface text; JetBrains Mono carries every number,
        // ticker, tool name and section label.
        sans: ["var(--font-sans)", "Chivo", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        panel: "14px",
        control: "10px",
      },
      boxShadow: {
        float: "var(--shadow-float)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 8s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
