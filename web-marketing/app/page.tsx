import { SiteNav, SiteFooter } from "@/components/chrome";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center">
        <h1
          style={{ fontFamily: "var(--font-heading)", fontSize: "2.5rem", lineHeight: 1.1 }}
        >
          Your knowledge,<br />owned outright.
        </h1>
        <p style={{ marginTop: "1.5rem", color: "var(--color-text-secondary)", maxWidth: "38ch" }}>
          Marrow is a self-hosted, open-source knowledge base with a restore guarantee.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
