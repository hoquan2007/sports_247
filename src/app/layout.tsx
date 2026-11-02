import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import "./globals.css";
import "./sports.css";
import "./matchday.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "SPORTS247 — Lịch thi đấu & tỷ số bóng đá trực tiếp",
  description: "Lịch thi đấu bóng đá hôm nay và tỷ số trực tiếp các giải lớn. Tự động cập nhật, theo giờ Việt Nam.",
  applicationName: "SPORTS247",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: "/",
    siteName: "SPORTS247",
    title: "SPORTS247 — Lịch thi đấu & tỷ số bóng đá trực tiếp",
    description: "Theo dõi lịch thi đấu và tỷ số bóng đá từ các nguồn dữ liệu thực tế, theo giờ Việt Nam.",
  },
  twitter: { card: "summary_large_image" },
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
        <link rel="preconnect" href="https://a.espncdn.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
