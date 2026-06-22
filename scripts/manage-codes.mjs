/**
 * アクセスコードの運用ツール（発行・一覧・上限変更・有効/無効切替）。
 * 管理画面は作らず、このCLIで運用する（最小構成）。
 *
 * 使い方（npm 経由。-- の後に引数を渡す）:
 *   npm run code -- issue --label "○○商事"               # 発行（--max省略で標準2回。コードは自動生成）
 *   npm run code -- issue --label "△△貿易" --max 50 --code MYCODE-1234  # 上限を指定する場合
 *   npm run code -- list                                  # 一覧（使用状況つき）
 *   npm run code -- set-max <code> <回数>                 # 累計上限を変更
 *   npm run code -- disable <code>                        # 無効化（即停止）
 *   npm run code -- enable  <code>                        # 再有効化
 *
 * db-migrate.mjs と同様、Next.js の外で動くため .env.local を自前で読み込み、
 * クラウドDB（localhost以外）では自動でSSLを有効化する。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

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
    /* .env.local が無ければ既存の環境変数に委ねる */
  }
}

async function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL が設定されていません（.env.local を確認してください）");
    process.exit(1);
  }
  const parsed = new URL(url);
  const host = parsed.hostname;
  const sslParam = parsed.searchParams.get("ssl");
  const useSsl =
    sslParam === "true" ||
    (sslParam !== "false" && host !== "localhost" && host !== "127.0.0.1");
  return mysql.createConnection({
    host,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    ...(useSsl ? { ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } } : {}),
  });
}

/** 紛らわしい文字（I,O,0,1）を除いた英数字でコードを生成する（4-4-4 のハイフン区切り）。 */
function generateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) {
    s += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) s += "-";
  }
  return s;
}

/** --key value 形式の引数を抜き出す簡易パーサ。 */
function parseFlags(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  loadEnvLocal();
  const [sub, ...rest] = process.argv.slice(2);
  const conn = await connect();
  try {
    if (sub === "issue") {
      const flags = parseFlags(rest);
      const code = flags.code || generateCode();
      const label = flags.label ?? null;
      // 標準はサンプル動作確認用に「2回」固定（API課金が絡むため）。必要なら --max で上書き。
      const max = flags.max ? Number(flags.max) : 2;
      if (!Number.isInteger(max) || max <= 0) {
        console.error("--max は正の整数で指定してください。");
        process.exit(1);
      }
      await conn.execute(
        "INSERT INTO access_codes (code, label, max_uses) VALUES (?, ?, ?)",
        [code, label, max]
      );
      console.log("アクセスコードを発行しました:");
      console.log("  コード   : " + code);
      console.log("  ラベル   : " + (label ?? "(なし)"));
      console.log("  累計上限 : " + max + " 回");
      console.log("\n※ このコードを企業に伝えてください（このツール以外で再表示はしません）。");
    } else if (sub === "list") {
      const [rows] = await conn.query(
        "SELECT code, label, used_count, max_uses, disabled, created_at FROM access_codes ORDER BY created_at DESC"
      );
      if (rows.length === 0) {
        console.log("発行済みのアクセスコードはありません。");
      } else {
        console.log("発行済みアクセスコード:");
        for (const r of rows) {
          const state = r.disabled ? "無効" : "有効";
          const remain = Math.max(r.max_uses - r.used_count, 0);
          console.log(
            `  ${r.code}  [${state}]  ${r.used_count}/${r.max_uses}（残り${remain}）  ${r.label ?? ""}`
          );
        }
      }
    } else if (sub === "set-max") {
      const [code, maxStr] = rest;
      const max = Number(maxStr);
      if (!code || !Number.isInteger(max) || max <= 0) {
        console.error("使い方: npm run code -- set-max <code> <正の整数>");
        process.exit(1);
      }
      const [res] = await conn.execute("UPDATE access_codes SET max_uses = ? WHERE code = ?", [max, code]);
      console.log(res.affectedRows === 1 ? `上限を ${max} 回に変更しました（${code}）。` : "該当するコードがありません。");
    } else if (sub === "disable" || sub === "enable") {
      const [code] = rest;
      if (!code) {
        console.error(`使い方: npm run code -- ${sub} <code>`);
        process.exit(1);
      }
      const [res] = await conn.execute("UPDATE access_codes SET disabled = ? WHERE code = ?", [
        sub === "disable" ? 1 : 0,
        code,
      ]);
      console.log(
        res.affectedRows === 1
          ? `${sub === "disable" ? "無効化" : "再有効化"}しました（${code}）。`
          : "該当するコードがありません。"
      );
    } else {
      console.log("使い方:");
      console.log('  npm run code -- issue --label "企業名"        # 標準2回（--max で上書き可）');
      console.log("  npm run code -- list");
      console.log("  npm run code -- set-max <code> <回数>");
      console.log("  npm run code -- disable <code>");
      console.log("  npm run code -- enable <code>");
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("処理に失敗しました:", err.message);
  process.exit(1);
});
