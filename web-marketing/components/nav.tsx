export default function Nav() {
  return (
    <header
      style={{ borderBottom: "1px solid var(--color-border)" }}
      className="sticky top-0 z-50 backdrop-blur-sm"
    >
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <span
          style={{ fontFamily: "Fraunces, serif", color: "var(--color-accent)" }}
          className="text-xl font-semibold tracking-tight"
        >
          Marrow
        </span>
        <nav className="flex items-center gap-6 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          <a
            href="https://github.com/spmcgraw/marrow"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://docs.marrow.so"
            className="hover:text-white transition-colors"
          >
            Docs
          </a>
          <a
            href="https://app.marrow.so"
            style={{
              background: "var(--color-accent)",
              color: "#fff",
              borderRadius: "6px",
              padding: "6px 14px",
            }}
            className="font-medium hover:opacity-90 transition-opacity"
          >
            Open app →
          </a>
        </nav>
      </div>
    </header>
  );
}
