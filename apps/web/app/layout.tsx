import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Major Study Helper",
  description: "Lecture recording, Russian summaries, and study quizzes for international students."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
