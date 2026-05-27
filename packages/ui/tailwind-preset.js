/** @vellum/ui Tailwind preset — maps semantic utilities to the themeable CSS
 * variables in theme.css. Consumers: add to `presets: [require("@vellum/ui/tailwind-preset")]`.
 * @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        base: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        fg: "var(--text)",
        muted: "var(--text-muted)",
        soft: "var(--text-soft)",
        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        "accent-fg": "var(--accent-fg)",
        "accent-soft": "var(--accent-soft)",
        danger: "var(--danger)",
        warn: "var(--warn)",
        info: "var(--info)",
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        glow: "var(--glow)",
      },
      fontFamily: {
        sans: ["Geist", "system-ui", "-apple-system", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
        serif: ["Instrument Serif", "Georgia", "serif"],
      },
    },
  },
};
