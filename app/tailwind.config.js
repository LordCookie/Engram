/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Design-Tokens als CSS-Variablen (siehe src/index.css), damit der
      // Skin an genau einer Stelle austauschbar bleibt (PLAN.md § 6).
      // rgb(var(...) / <alpha-value>): so greifen Opacity-Modifier wie `bg-accent/70`
      // (Variablen sind space-getrennte RGB-Kanäle, siehe src/index.css).
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        text: 'rgb(var(--c-text) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        card: {
          red: 'rgb(var(--c-red) / <alpha-value>)',
          green: 'rgb(var(--c-green) / <alpha-value>)',
          blue: 'rgb(var(--c-blue) / <alpha-value>)',
          yellow: 'rgb(var(--c-yellow) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
