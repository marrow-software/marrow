import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marrow — Self-hosted knowledge base",
  description:
    "Marrow is an open-source, self-hosted wiki built around a non-negotiable restore guarantee.",
  metadataBase: new URL("https://marrow.so"),
  openGraph: {
    title: "Marrow — Self-hosted knowledge base",
    description:
      "An open-source wiki with a restore guarantee. Your data, your server.",
    url: "https://marrow.so",
    siteName: "Marrow",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
