import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "../components/Sidebar.tsx";

export const metadata: Metadata = {
  title: "AXIS — Atomic X402 Integrated Settlement",
  description: "N paid API calls · one atomic payment · one receipt",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex" }}>
          <Sidebar />
          <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        </div>
      </body>
    </html>
  );
}
