import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src/i18n/catalogs"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Build-pipeline and Lambda sources (.mjs). These had NO rules applied at all:
  // every `files` block above targets only .ts/.tsx, so ~4,300 lines of build
  // scripts and the two Lambdas were completely unlinted — an undefined variable
  // or an unreachable branch in them would only ever surface at build or run
  // time. Node globals, not browser; module scope, since they are all ESM.
  {
    extends: [js.configs.recommended],
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      // The build scripts intentionally destructure-and-ignore, and several
      // catch blocks deliberately swallow (documented fail-safe paths).
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },

  // Disable react-refresh warnings for shadcn/ui components
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // entry-server.tsx is the SSR entry, not a fast-refreshed component module: it
  // legitimately exports render() and re-exports the locale config for the Node
  // build scripts. The rule doesn't apply here.
  {
    files: ["src/entry-server.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
