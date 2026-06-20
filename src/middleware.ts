/**
 * アクセスコード認証のゲート（B案）。
 *
 * 照合機能（事後/事前チェック・レポート・関連API）は、認証済み Cookie が無いと使えない。
 * ここでは Cookie の有無だけを軽く確認する（コードの有効性チェックは /api/gate と
 * 各APIがDBで行う）。トップ・About・ゲート画面は公開のまま（入口は誰でも見られる）。
 */

import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_CODE_COOKIE } from "@/lib/access-config";

const PROTECTED_PAGE_PREFIXES = ["/post-check", "/pre-check", "/report"];
const PROTECTED_API_PREFIXES = ["/api/checks", "/api/clarifications"];

export function middleware(req: NextRequest): NextResponse {
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
