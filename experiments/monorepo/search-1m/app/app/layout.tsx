import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "도서 검색" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
