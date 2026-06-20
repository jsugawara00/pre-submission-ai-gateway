/**
 * DDL適用スクリプト（src/lib/db/schema.sql を実行する）。
 * 使い方: npm run db:migrate
 *
 * Next.js のランタイム外で動くため、.env.local を自前で読み込む。
 * schema.sql は CREATE TABLE IF NOT EXISTS のみなので、繰り返し実行しても安全（冪等）。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// .env.local を最小パースして process.env に載せる
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(projectRoot, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local が無い場合は既存の環境変数に委ねる
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL が設定されていません（.env.local を確認してください）");
    process.exit(1);
  }

  const sql = readFileSync(join(projectRoot, "src", "lib", "db", "schema.sql"), "utf8");

  const parsed = new URL(url);
  // クラウドDB（TiDB Serverless 等＝localhost以外）はTLS必須のためSSLを有効化する。
  const host = parsed.hostname;
  const sslParam = parsed.searchParams.get("ssl");
  const useSsl =
    sslParam === "true" ||
    (sslParam !== "false" && host !== "localhost" && host !== "127.0.0.1");
  const conn = await mysql.createConnection({
    host,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    multipleStatements: true, // schema.sql の複数CREATEを一括実行するため
    ...(useSsl ? { ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } } : {}),
  });

  try {
    await conn.query(sql);
    const [tables] = await conn.query("SHOW TABLES");
    console.log("マイグレーション完了。現在のテーブル:");
    for (const row of tables) {
      console.log("  - " + Object.values(row)[0]);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("マイグレーション失敗:", err.message);
  process.exit(1);
});
