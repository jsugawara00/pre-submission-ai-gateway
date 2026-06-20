import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本番ビルドでブラウザ向けソースマップを生成しない（元コードの復元を防ぐ。
  // Next.jsの既定もfalseだが、意図を明示して将来の誤設定を防ぐ）。
  productionBrowserSourceMaps: false,
  // "X-Powered-By: Next.js" ヘッダを出さない（使用技術の不要な露出を避ける）。
  poweredByHeader: false,
};

export default nextConfig;
