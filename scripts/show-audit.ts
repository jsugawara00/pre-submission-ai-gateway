/**
 * 直近の監査ログ（audit_logs）を表示する確認用スクリプト。
 * 使い方: npx tsx scripts/show-audit.ts [action]
 *   action を渡すとその action だけに絞る（例: npx tsx scripts/show-audit.ts naccs_export）
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { RowDataPacket } from "mysql2";
import { getPool } from "../src/lib/db/client";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(projectRoot, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let value = t.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* .env.local が無ければ既存の環境変数に委ねる */
  }
}

async function main() {
  loadEnvLocal();
  const action = process.argv[2];

  const sql = action
    ? `SELECT id, action, check_id, application_id, detail, created_at FROM audit_logs WHERE action = ? ORDER BY id DESC LIMIT 10`
    : `SELECT id, action, check_id, application_id, detail, created_at FROM audit_logs ORDER BY id DESC LIMIT 10`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, action ? [action] : []);

  console.log(`audit_logs（${action ? `action=${action}` : "最新10件"}）:`);
  for (const r of rows) {
    console.log(`  #${r.id} [${r.action}] check=${r.check_id ?? "-"} app=${r.application_id ?? "-"}`);
    if (r.detail) console.log(`      detail: ${typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail)}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("監査ログ確認に失敗:", e?.message ?? e);
  process.exit(1);
});
