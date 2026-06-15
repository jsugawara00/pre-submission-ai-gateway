import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * vitest 設定。
 * 本番（Next.js）は tsconfig の paths で "@/..." を src 配下に解決するが、
 * vitest はそれを見ないため、同等の alias をここで定義する。
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
