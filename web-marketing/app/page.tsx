export const runtime = "edge";

export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.marrow.so";

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <span className="font-semibold text-lg tracking-tight">Marrow</span>
        <a
          href={appUrl}
          className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          Open app →
        </a>
      </nav>

      <section className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Your knowledge base.
          <br />
          Your server.
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-xl mx-auto">
          Marrow is an open-source, self-hosted wiki built around a
          non-negotiable restore guarantee. Export any time. Own your data
          forever.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="https://github.com/spmcgraw/marrow"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-700 transition-colors"
          >
            View on GitHub
          </a>
          <a
            href={appUrl}
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-gray-200 font-medium hover:border-gray-400 transition-colors"
          >
            Open app
          </a>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16 grid sm:grid-cols-3 gap-8 text-center border-t border-gray-100">
        <div>
          <h3 className="font-semibold mb-2">Restore guarantee</h3>
          <p className="text-sm text-gray-500">
            Every export is a complete, self-contained bundle. Restore to an
            exact replica any time.
          </p>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Append-only revisions</h3>
          <p className="text-sm text-gray-500">
            History is immutable at the database level. Nothing is ever quietly
            overwritten.
          </p>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Open source</h3>
          <p className="text-sm text-gray-500">
            Apache 2.0 licensed. Run it anywhere — bare metal, Docker, or
            Cloudflare.
          </p>
        </div>
      </section>

      <footer className="border-t border-gray-100 px-6 py-8 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} Marrow · Apache 2.0
      </footer>
    </main>
  );
}
