import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// B案「ライトテーブル照合」用。見出し＝Space Grotesk、データ＝JetBrains Mono。
// 日本語グリフは既存の和文スタックへフォールバックさせる。
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

// --font-mono はAboutのコード表示など既存箇所からも参照される共通変数。
const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "申請前AI検問所",
  description: "申請・申告内容と元資料をAIで照合し、転記ミスや資料間の矛盾を検出します。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable}`}
    >
      <body>
        <div className="app-shell">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
