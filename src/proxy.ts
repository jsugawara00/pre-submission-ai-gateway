/**
 * アクセスコード認証のゲート（B案）— Next.js 16 の proxy（旧 middleware）。
 *
 * 照合機能（事後/事前チェック・レポート・関連API）は、認証済み Cookie が無いと使えない。
 * ここでは Cookie の有無だけを軽く確認する（コードの有効性チェックは /api/gate と
 * 各APIがDBで行う）。トップ・About・ゲート画面は公開のまま（入口は誰でも見られる）。
 *
 * 防御は proxy 単独に依存しない: /api/checks 自体も Cookie を検証し回数を消費するため、
 * proxy をすり抜けても照合は実行されない（多層防御。CVE-2025-29927 の考え方に沿う）。
 */

import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_CODE_COOKIE } from "@/lib/access-config";

const PROTECTED_PAGE_PREFIXES = ["/post-check", "/pre-check", "/report"];
const PROTECTED_API_PREFIXES = ["/api/checks", "/api/clarifications"];

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const hasCode = Boolean(req.cookies.get(ACCESS_CODE_COOKIE)?.value);
  if (hasCode) return NextResponse.next();

  // 未認証: APIはJSONで401、ページはゲートへ誘導（戻り先を next に保持）。
  if (PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.json({ error: "アクセスコードでの認証が必要です。" }, { status: 401 });
  }
  if (PROTECTED_PAGE_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/gate";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/post-check/:path*",
    "/pre-check/:path*",
    "/report/:path*",
    "/api/checks/:path*",
    "/api/clarifications/:path*",
  ],
};
