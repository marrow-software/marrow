import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marrow — Self-hosted knowledge base",
  description:
    "A self-hosted, open-source knowledge base built around a restore guarantee. Your data, your server, always recoverable.",
  openGraph: {
    title: "Marrow",
    description: "Self-hosted knowledge base with a restore guarantee.",
    url: "https://marrow.so",
    siteName: "Marrow",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
