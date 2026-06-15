/**
 * SQL関数群。すべてプレースホルダ（prepared statement）で実行する（CLAUDE.md 第6章）。
 * 文字列連結でSQLを組まない。テーブル名はコード内リテラルのみ（外部入力を渡さない）。
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./client";
import type { CheckResult, Mode, Verdict } from "../engine/schema";

// --- 保存用の補助型 ---

/** applications.documents に格納する1書類分のメタ情報（PDF原本はストレージ側）。 */
export interface DocumentMeta {
  doc_id: string;
  original_name: string;
  stored_path: string; // 暗号化済みファイルの保存パス
  sha256: string;
  size_bytes: number;
  mime: string;
  role: "target" | "reference"; // 改訂1: チェック対象 / 関係書類
}

export interface ApplicationRow {
  id: string;
  mode: Mode;
  applicant: string | null;
  form_input: Record<string, unknown> | null;
  documents: DocumentMeta[] | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CheckResultRow {
  id: string;
  application_id: string;
  result_json: CheckResult;
  raw_response: string;
  verdict: Verdict;
  high_count: number;
  medium_count: number;
  low_count: number;
  unverified_count: number;
  clarifications_open: number;
  model: string | null;
  created_at: Date;
}

// --- ID生成（chk_YYYYMMDD_0001 形式。スキーマ設計v0.2の例に準拠） ---

function todayStamp(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * 当日分の連番IDを生成する。MVPでは同時実行が稀なためCOUNTで採番する
 * （厳密な一意採番が必要になればシーケンステーブル等へ移行）。
 */
async function generateDailyId(table: "applications" | "check_results", prefix: string): Promise<string> {
  const stamp = todayStamp();
  const like = `${prefix}_${stamp}_%`;
  const sql = `SELECT COUNT(*) AS c FROM ${table} WHERE id LIKE ?`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, [like]);
  const seq = Number(rows[0]?.c ?? 0) + 1;
  return `${prefix}_${stamp}_${String(seq).padStart(4, "0")}`;
}

/** 新しい check_id を採番する（エンジン側で result に設定してから保存するため公開）。 */
export function generateCheckId(): Promise<string> {
  return generateDailyId("check_results", "chk");
}

// --- JSON列の読み出し補助（mysql2のバージョン差を吸収） ---

function parseJsonColumn<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

// --- applications ---

export interface CreateApplicationInput {
  mode: Mode;
  applicant?: string | null;
  formInput?: Record<string, unknown> | null;
  documents?: DocumentMeta[] | null;
  status?: string;
}

export async function createApplication(input: CreateApplicationInput): Promise<string> {
  const id = await generateDailyId("applications", "app");
  const sql = `
    INSERT INTO applications (id, mode, applicant, form_input, documents, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  await getPool().execute(sql, [
    id,
    input.mode,
    input.applicant ?? null,
    input.formInput != null ? JSON.stringify(input.formInput) : null,
    input.documents != null ? JSON.stringify(input.documents) : null,
    input.status ?? "created",
  ]);
  return id;
}

export async function getApplicationById(id: string): Promise<ApplicationRow | null> {
  const sql = `SELECT * FROM applications WHERE id = ? LIMIT 1`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, [id]);
  const row = rows[0];
  if (!row) return null;
  return {
    ...(row as ApplicationRow),
    form_input: parseJsonColumn(row.form_input),
    documents: parseJsonColumn(row.documents),
  };
}

export async function updateApplicationDocuments(id: string, documents: DocumentMeta[]): Promise<void> {
  const sql = `UPDATE applications SET documents = ? WHERE id = ?`;
  await getPool().execute(sql, [JSON.stringify(documents), id]);
}

export async function updateApplicationStatus(id: string, status: string): Promise<void> {
  const sql = `UPDATE applications SET status = ? WHERE id = ?`;
  await getPool().execute(sql, [status, id]);
}

// --- check_results ---

export interface CreateCheckResultInput {
  applicationId: string;
  /** verdict・件数はサーバー側（verdict.ts）で算出済みの最終 CheckResult を渡す。check_id を id に使う。 */
  result: CheckResult;
  rawResponse: string;
  model?: string | null;
}

export async function createCheckResult(input: CreateCheckResultInput): Promise<string> {
  const { result } = input;
  const s = result.summary;
  const sql = `
    INSERT INTO check_results
      (id, application_id, result_json, raw_response, verdict,
       high_count, medium_count, low_count, unverified_count, clarifications_open, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await getPool().execute(sql, [
    result.check_id,
    input.applicationId,
    JSON.stringify(result),
    input.rawResponse,
    s.verdict,
    s.high,
    s.medium,
    s.low,
    s.unverified,
    s.clarifications_open,
    input.model ?? null,
  ]);
  return result.check_id;
}

/**
 * 既存の照合結果を確定後の内容で更新する（聞き返し解決後の result_json と verdict・件数）。
 * result.check_id を主キーとして上書きする。
 */
export async function updateCheckResult(result: CheckResult): Promise<void> {
  const s = result.summary;
  const sql = `
    UPDATE check_results
    SET result_json = ?, verdict = ?, high_count = ?, medium_count = ?, low_count = ?,
        unverified_count = ?, clarifications_open = ?
    WHERE id = ?
  `;
  await getPool().execute(sql, [
    JSON.stringify(result),
    s.verdict,
    s.high,
    s.medium,
    s.low,
    s.unverified,
    s.clarifications_open,
    result.check_id,
  ]);
}

export async function getCheckResultById(checkId: string): Promise<CheckResultRow | null> {
  const sql = `SELECT * FROM check_results WHERE id = ? LIMIT 1`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, [checkId]);
  const row = rows[0];
  if (!row) return null;
  return {
    ...(row as CheckResultRow),
    result_json: parseJsonColumn<CheckResult>(row.result_json)!,
  };
}

export async function getLatestCheckResultByApplication(applicationId: string): Promise<CheckResultRow | null> {
  const sql = `SELECT * FROM check_results WHERE application_id = ? ORDER BY created_at DESC LIMIT 1`;
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, [applicationId]);
  const row = rows[0];
  if (!row) return null;
  return {
    ...(row as CheckResultRow),
    result_json: parseJsonColumn<CheckResult>(row.result_json)!,
  };
}

// --- audit_logs ---

export interface AuditLogInput {
  action: string; // upload / check / view / clarification_resolve など
  applicationId?: string | null;
  checkId?: string | null;
  actor?: string | null;
  detail?: Record<string, unknown> | null;
}

export async function insertAuditLog(input: AuditLogInput): Promise<number> {
  const sql = `
    INSERT INTO audit_logs (application_id, check_id, action, actor, detail)
    VALUES (?, ?, ?, ?, ?)
  `;
  const [result] = await getPool().execute<ResultSetHeader>(sql, [
    input.applicationId ?? null,
    input.checkId ?? null,
    input.action,
    input.actor ?? null,
    input.detail != null ? JSON.stringify(input.detail) : null,
  ]);
  return result.insertId;
}
