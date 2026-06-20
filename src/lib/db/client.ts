/**
 * MySQL コネクションプール（mysql2/promise）。
 *
 * - 接続情報は環境変数 DATABASE_URL（例: mysql://user:pass@host:3306/db）から取得する。
 * - Next.js の開発時ホットリロードでプールが多重生成されないよう、globalThis に保持する。
 * - 生SQLはすべてプレースホルダ（execute）で扱う方針（CLAUDE.md 第6章）。
 * - クラウドDB（TiDB Serverless 等＝localhost以外）は TLS 必須のため自動でSSL有効化。
 *   ローカルMySQL（localhost）はSSL無効。`?ssl=true`/`?ssl=false` で明示上書きも可能。
 */

import mysql from "mysql2/promise";

function buildPool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL が設定されていません（.env.local を確認してください）");
  }

  const parsed = new URL(url);
  const host = parsed.hostname;
  const sslParam = parsed.searchParams.get("ssl");
  // 明示指定があれば従い、無ければ「localhost以外＝クラウド」でSSLを有効化する。
  const useSsl =
    sslParam === "true" ||
    (sslParam !== "false" && host !== "localhost" && host !== "127.0.0.1");

  return mysql.createPool({
    host,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
    timezone: "Z", // DATETIME を UTC として一貫して扱う
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    ...(useSsl ? { ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } } : {}),
  });
}

// 開発時のホットリロード対策: グローバルに1つだけ保持する。
// プールは初回利用時に遅延生成する（モジュール読み込み時点では環境変数が
// まだ読まれていない場合があるため）。
const globalForDb = globalThis as unknown as { __aiGatewayPool?: mysql.Pool };

export function getPool(): mysql.Pool {
  if (!globalForDb.__aiGatewayPool) {
    globalForDb.__aiGatewayPool = buildPool();
  }
  return globalForDb.__aiGatewayPool;
}
