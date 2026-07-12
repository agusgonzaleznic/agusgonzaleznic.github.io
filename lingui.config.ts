import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";
import { ALL_LOCALES, SOURCE_LOCALE } from "./src/i18n/locales";

// One source of truth: locales come from src/i18n/locales.ts. We EXTRACT all
// six so translators can start, but PUBLISHED_LOCALES (also in locales.ts) gates
// what actually renders/links — extracting a locale is not publishing it.
export default defineConfig({
  sourceLocale: SOURCE_LOCALE,
  locales: [...ALL_LOCALES],
  catalogs: [
    {
      // -> src/i18n/catalogs/en.po, src/i18n/catalogs/de.po, …
      path: "<rootDir>/src/i18n/catalogs/{locale}",
      include: ["src"],
      exclude: ["**/node_modules/**"],
    },
  ],
  // PO catalogs. lineNumbers: false keeps catalogs stable across refactors (no
  // churn when a wrapped string moves lines) and avoids leaking source paths.
  format: formatter({ lineNumbers: false }),
});
