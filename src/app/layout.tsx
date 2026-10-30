import type { Metadata } from "next";
import "./globals.css";
import "./sports.css";
import "./matchday.css";

export const metadata: Metadata = {
  title: "SPORTS247 — Lịch thi đấu & tỷ số bóng đá trực tiếp",
  description: "Lịch thi đấu bóng đá hôm nay và tỷ số trực tiếp các giải lớn. Tự động cập nhật, theo giờ Việt Nam.",
  applicationName: "SPORTS247",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
