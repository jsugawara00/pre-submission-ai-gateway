/**
 * レポート画面のローディングUI（Next.js の loading.tsx）。
 *
 * report/page.tsx は force-dynamic（毎回DBから取得＋監査ログ）でサーバー側に時間がかかる。
 * loading.tsx が無いと、遷移直後にスタイル適用前の素のHTML（黒地に白文字）が一瞬見える
 * FOUC が起こり得る。ここでスタイル付きの待機画面を挟み、その一瞬を覆う。
 * 演出は照合中と同じ ScanningIndicator を流用（事前/事後・照合中/閲覧で見た目を統一）。
 */
import ScanningIndicator from "@/components/ScanningIndicator/ScanningIndicator";

export default function Loading() {
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 20px" }}>
      <ScanningIndicator
        label="レポートを準備しています"
        note="保存済みの照合結果を読み込んでいます。"
      />
    </div>
  );
}
