import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Turbopackのワークスペースルートをこのプロジェクトに固定する。
  // 親ディレクトリ（C:\Users\FMV）に別の package-lock.json があると、
  // Turbopackがそちらをルートと誤検出して警告・モジュール解決の乱れを招くため、明示する。
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  // 本番ビルドでブラウザ向けソースマップを生成しない（元コードの復元を防ぐ。
  // Next.jsの既定もfalseだが、意図を明示して将来の誤設定を防ぐ）。
  productionBrowserSourceMaps: false,
  // "X-Powered-By: Next.js" ヘッダを出さない（使用技術の不要な露出を避ける）。
  poweredByHeader: false,
};

export default nextConfig;
