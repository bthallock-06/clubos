import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Club OS",
  description: "One login that runs an independent sports club.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
