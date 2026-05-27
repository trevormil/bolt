import preset from "@vellum/ui/tailwind-preset";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: [
    "./index.html",
    "./src/app/**/*.{ts,tsx}",
    "../ui/src/**/*.{ts,tsx}",
  ],
};
