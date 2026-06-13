/**
 * MySQL コネクションプール（mysql2/promise）。
 *
 * - 接続情報は環境変数 DATABASE_URL（例: mysql://user:pass@host:3306/db）から取得する。
 * - Next.js の開発時ホットリロードでプールが多重生成されないよう、globalThis に保持する。
 * - 生SQLはすべてプレースホルダ（execute）で扱う方針（CLAUDE.md 第6章）。
 */

import mysql from "mysql2/promise";

function buildPool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL が設定されていません（.env.local を確認してください）");
  }

  const parsed = new URL(url);
  return mysql.createPool({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
    timezone: "Z", // DATETIME を UTC として一貫して扱う
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
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
