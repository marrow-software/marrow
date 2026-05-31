import { Chrome } from "@/components/chrome";

export default function HomePage() {
  return (
    <Chrome>
      <section className="mx-auto max-w-6xl px-6 py-32">
        <p
          className="mb-4 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Phase B · scaffold
        </p>
        <h1
          className="max-w-3xl text-balance text-5xl leading-[1.05] tracking-tight md:text-6xl"
          style={{
            fontFamily: "var(--font-heading)",
            fontVariationSettings: '"SOFT" 100, "opsz" 144',
            fontWeight: 500,
          }}
        >
          Your knowledge, down to the marrow.
        </h1>
        <p className="mt-6 max-w-xl text-base text-[var(--muted-foreground)]">
          The marketing app shell is live. Landing, Product, and Pricing pages
          will be built on this shared chrome.
        </p>
      </section>
    </Chrome>
  );
}
