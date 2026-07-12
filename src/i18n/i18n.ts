// The shared Lingui i18n instance + load/activate helpers.
//
// This is the global `@lingui/core` singleton. The prerender loop (sequential,
// single-process) activates a locale before each renderToString, and the client
// activates once from the URL before hydrating — both pass THIS instance to
// <I18nProvider>, so no i18n object ever crosses the SSR boundary (Lingui's
// instance is intentionally non-serialisable).

import { i18n } from "@lingui/core";
import { messages as enMessages } from "./catalogs/en.po";
import { SOURCE_LOCALE } from "./locales";

// Load + activate English eagerly so the source locale is always available
// synchronously: renderToString is sync, and the default (root) client render
// happens before any dynamic catalog is fetched.
i18n.load(SOURCE_LOCALE, enMessages);
i18n.activate(SOURCE_LOCALE);

export { i18n };

/**
 * Load a locale's catalog and activate it. On the client the `.po` import is a
 * code-split chunk (one per locale, fetched only when that locale is visited);
 * on the server it is bundled. English is already loaded, so it just
 * re-activates without a fetch.
 */
export async function dynamicActivate(locale: string): Promise<void> {
  if (locale === SOURCE_LOCALE) {
    i18n.activate(SOURCE_LOCALE);
    return;
  }
  const { messages } = await import(`./catalogs/${locale}.po`);
  i18n.load(locale, messages);
  i18n.activate(locale);
}
