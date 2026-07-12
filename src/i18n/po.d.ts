// Type for the compiled catalog objects that @lingui/vite-plugin produces when a
// `.po` file is imported (statically or via dynamic import()).
declare module "*.po" {
  import type { Messages } from "@lingui/core";
  export const messages: Messages;
}
