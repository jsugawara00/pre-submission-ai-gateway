/**
 * レポート画面のローディングUI（Next.js の loading.tsx）。
 *
 * report/page.tsx は force-dynamic（毎回DBから取得＋監査ログ）でサーバー側に時間がかかる。
 * loading.tsx が無いと遷移直後にFOUC（素のHTMLが一瞬見える）が起こり得るため、
 * スタイル付きの待機画面を挟む。post-check の遷移ハンドオフと同一の ReportLoading を使い、
 * 「照合中→準備中→レポート」を切れ目なく繋ぐ。
 */
import ReportLoading from "@/components/ReportLoading/ReportLoading";

export default function Loading() {
  return <ReportLoading />;
}
