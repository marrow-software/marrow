import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

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

// Set data-theme from localStorage before first paint to avoid a flash of the
// wrong theme (FOUC). Static-export safe: runs inline in <head>.
const themeInitScript = `(function () {
  try {
    var t = localStorage.getItem("marrow-theme");
    document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
