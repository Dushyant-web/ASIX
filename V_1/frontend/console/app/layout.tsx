import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "../components/Sidebar.tsx";

export const metadata: Metadata = {
  title: "AXIS",
  description: "N paid API calls · one atomic payment · one receipt",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        <hr />
        {children}
      </body>
    </html>
  );
}
