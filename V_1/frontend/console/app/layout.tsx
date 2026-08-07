import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AXIS — Atomic X402 Integrated Settlement",
  description: "N paid API calls. One atomic payment. One receipt.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
