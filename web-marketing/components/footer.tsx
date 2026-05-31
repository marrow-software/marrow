export default function Footer() {
  return (
    <footer
      style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
      className="py-10"
    >
      <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        <span style={{ fontFamily: "Fraunces, serif", color: "var(--color-accent)" }} className="font-semibold">
          Marrow
        </span>
        <div className="flex gap-6">
          <a href="https://docs.marrow.so" className="hover:text-white transition-colors">Docs</a>
          <a
            href="https://github.com/spmcgraw/marrow"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
          <a href="https://docs.marrow.so/deployment" className="hover:text-white transition-colors">Deploy</a>
        </div>
        <span>Apache 2.0 — open source</span>
      </div>
    </footer>
  );
}
