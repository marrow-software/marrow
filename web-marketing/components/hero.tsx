export default function Hero() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-28 text-center">
      <p
        className="text-xs font-semibold uppercase tracking-widest mb-5"
        style={{ color: "var(--color-accent)" }}
      >
        Open source · Self-hosted · Apache 2.0
      </p>
      <h1
        className="text-5xl md:text-6xl font-semibold leading-tight mb-6"
        style={{ fontFamily: "Fraunces, serif" }}
      >
        Your knowledge base,
        <br />
        <em>always recoverable.</em>
      </h1>
      <p
        className="text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Marrow is a self-hosted wiki with a non-negotiable restore guarantee.
        Every export bundle is human-readable Markdown that restores to an exact
        replica — no lock-in, no surprises.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <a
          href="https://docs.marrow.so/getting-started"
          style={{
            background: "var(--color-accent)",
            color: "#fff",
            borderRadius: "8px",
            padding: "12px 28px",
            fontWeight: 500,
          }}
          className="hover:opacity-90 transition-opacity text-base"
        >
          Get started
        </a>
        <a
          href="https://github.com/spmcgraw/marrow"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
            borderRadius: "8px",
            padding: "12px 28px",
            fontWeight: 500,
          }}
          className="hover:border-gray-500 transition-colors text-base"
        >
          View on GitHub
        </a>
      </div>
    </section>
  );
}
