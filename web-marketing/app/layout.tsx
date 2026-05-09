import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});
const fraunces = localFont({
  src: "../../web/public/fonts/Fraunces.ttf",
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Marrow — a knowledge base built to last",
  description:
    "A self-hosted, MIT-licensed home for your team's notes, docs, and decisions. Plain Markdown, Postgres, no telemetry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
