// Flat ESLint config (Next 16 removed `next lint`; the ESLint CLI runs this).
// Mirrors the old .eslintrc.json baseline — next/core-web-vitals with
// react/no-unescaped-entities off — plus the Next TypeScript preset.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      // New opinionated rules in eslint-plugin-react-hooks v7 that flag
      // long-standing patterns throughout this codebase (state resets inside
      // data-fetching effects, render-phase ref mirrors). Restructuring those
      // is a behavioural refactor, not a lint fix — keep the previous
      // baseline until that's done deliberately.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
  {
    // Vendored from reactbits.dev (see the file headers) — third-party code we
    // deliberately don't rewrite to satisfy our own strictness settings.
    files: [
      "src/components/ui/circular-gallery.tsx",
      "src/components/ui/blur-text.tsx",
    ],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
