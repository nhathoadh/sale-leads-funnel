import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sale Leads Funnel",
  description: "Daily sales lead prioritization dashboard"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
