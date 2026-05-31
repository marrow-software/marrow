const features = [
  {
    title: "Restore guarantee",
    description:
      "Every workspace can be exported as a zip bundle and restored to an exact replica. The bundle is plain Markdown and JSON — readable without any tooling.",
  },
  {
    title: "Append-only revisions",
    description:
      "Saves always create new revisions. Existing revisions are never modified or deleted. History is enforced at the database level, not just convention.",
  },
  {
    title: "Hierarchical structure",
    description:
      "Organize knowledge into workspaces, spaces, and a flexible node tree. Folders and pages compose freely with fractional-index ordering.",
  },
  {
    title: "Full-text search",
    description:
      "PostgreSQL-backed full-text search across all pages in a workspace. Results include ancestor breadcrumbs so you know exactly where a page lives.",
  },
  {
    title: "OIDC authentication",
    description:
      "Connect any OIDC-compatible identity provider (Google, Okta, Keycloak…). API key mode is also available for scripts and CLI access.",
  },
  {
    title: "Export & CLI",
    description:
      "The `marrow export` and `marrow restore` CLI commands let you back up, migrate, or inspect any workspace without touching the UI.",
  },
];

export default function Features() {
  return (
    <section style={{ borderTop: "1px solid var(--color-border)" }} className="py-24">
      <div className="max-w-5xl mx-auto px-6">
        <h2
          className="text-3xl font-semibold mb-3 text-center"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Built to last
        </h2>
        <p
          className="text-center mb-16 max-w-xl mx-auto"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Every design decision flows from one constraint: you must always be
          able to get your data back, exactly as you left it.
        </p>
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "12px",
                padding: "24px",
              }}
            >
              <h3
                className="text-lg font-semibold mb-2"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                {f.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
