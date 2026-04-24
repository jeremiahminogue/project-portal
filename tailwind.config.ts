import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // PE brand tokens (sourced from skills/oac-agenda/generate_agenda.py)
        "pe-green": "#1DAF3F",
        "pe-green-dark": "#18923A",
        "pe-green-dk": "#169234",
        "pe-green-tn": "#E8F7EC",
        "pe-gray": "#A8A9AD",
        "pe-charcoal": "#3C3C3C",
        "pe-black": "#1A1A1A",
        "pe-body": "#2D2D2D",
        "pe-sub": "#6B6B6B",
        "pe-light": "#999999",
        canvas: "#F6F6F8",
        ink: {
          900: "#1A1A1A",
          700: "#2D2D2D",
          500: "#6B6B6B",
          300: "#999999",
          100: "#E5E5E7",
        },
        // semantic
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "16px",
        md: "12px",
        sm: "8px",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -12px rgba(0,0,0,0.08)",
        pop: "0 1px 2px rgba(0,0,0,0.04), 0 32px 64px -24px rgba(0,0,0,0.14)",
        rim: "inset 0 0 0 1px rgba(255,255,255,0.7), 0 1px 2px rgba(0,0,0,0.04)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
