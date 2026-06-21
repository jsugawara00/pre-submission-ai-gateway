/**
 * POST /api/gate — アクセスコードによる認証（B案）。
 *
 * コードが存在し有効なら httpOnly Cookie を発行する。残り回数は問わない
 * （ログインは通し、上限は照合実行時に判定する）。コード値はサーバー側でのみ扱う。
 */

import { NextResponse } from "next/server";
import { ACCESS_CODE_COOKIE } from "@/lib/access-config";
import { isAccessCodeActive, insertAuditLog } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.trim() : "";
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "アクセスコードを入力してください。" }, { status: 400 });
  }

  let active = false;
  try {
    active = await isAccessCodeActive(code);
  } catch (err) {
    console.error("[gate] 認証処理エラー:", err);
    return NextResponse.json(
      { error: "認証処理中にエラーが発生しました。お手数ですがアプリの管理者にお問い合わせください。" },
      { status: 500 }
    );
  }

  if (!active) {
    return NextResponse.json(
      { error: "アクセスコードが正しくないか、現在ご利用いただけません。" },
      { status: 401 }
    );
  }

  // ログイン成功を監査記録（ベストエフォート）。
  try {
    await insertAuditLog({ action: "login", actor: code });
  } catch {
    /* noop */
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_CODE_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30日
  });
  return res;
}
