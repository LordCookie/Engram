/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Design-Tokens als CSS-Variablen (siehe src/index.css), damit der
      // Skin an genau einer Stelle austauschbar bleibt (PLAN.md § 6).
      colors: {
        bg: 'var(--c-bg)',
        surface: 'var(--c-surface)',
        text: 'var(--c-text)',
        muted: 'var(--c-muted)',
        accent: 'var(--c-accent)',
        card: {
          red: 'var(--c-red)',
          green: 'var(--c-green)',
          blue: 'var(--c-blue)',
          yellow: 'var(--c-yellow)',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
