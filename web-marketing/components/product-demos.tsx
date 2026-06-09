"use client";

/* Demo components for the product tour. Each renders a static, visually
 * faithful mock of the corresponding Marrow feature — no live API calls. */

function DemoShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border overflow-hidden shadow-lg"
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      {/* Window chrome */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{
          backgroundColor: "var(--muted)",
          borderColor: "var(--border)",
        }}
      >
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: "var(--border)" }}
        />
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: "var(--border)" }}
        />
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: "var(--border)" }}
        />
        <span
          className="text-xs ml-3 flex-1 text-center"
          style={{
            color: "var(--muted-foreground)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {title}
        </span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Editor demo
 * Shows a mock page editor with block content, code block, and status bar.
 * --------------------------------------------------------------------------- */
export function EditorDemo() {
  return (
    <DemoShell title="marrow · Getting Started">
      <div className="space-y-1">
        {/* Title */}
        <div
          className="text-xl font-semibold mb-3"
          style={{
            fontFamily: "var(--font-heading)",
            fontVariationSettings: "'SOFT' 40, 'wght' 600",
            color: "var(--foreground)",
          }}
        >
          Getting Started
        </div>

        {/* Paragraph block */}
        <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
          Welcome to Marrow. This is your first page — start writing, or use{" "}
          <span
            className="px-1 rounded text-xs"
            style={{
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--muted)",
              color: "var(--color-accent)",
            }}
          >
            /
          </span>{" "}
          to insert a block.
        </p>

        {/* Code block mock */}
        <div
          className="rounded-lg border overflow-hidden mt-3"
          style={{
            backgroundColor: "var(--muted)",
            borderColor: "var(--border)",
          }}
        >
          <div
            className="px-3 py-1.5 text-xs border-b flex items-center justify-between"
            style={{
              borderColor: "var(--border)",
              color: "var(--muted-foreground)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>shell</span>
            <span>copy</span>
          </div>
          <pre
            className="px-3 py-2 text-xs"
            style={{
              color: "var(--foreground)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <code>
              <span style={{ color: "var(--muted-foreground)" }}>$</span>{" "}
              <span style={{ color: "var(--color-accent)" }}>docker</span>{" "}
              compose up -d
            </code>
          </pre>
        </div>

        {/* Mention mock */}
        <p className="text-sm leading-relaxed mt-2" style={{ color: "var(--foreground)" }}>
          Assigned to{" "}
          <span
            className="inline-flex items-baseline px-1.5 rounded text-xs font-mono uppercase tracking-wide"
            style={{
              backgroundColor: `color-mix(in oklab, var(--color-accent) 12%, transparent)`,
              color: "var(--color-accent)",
            }}
          >
            @sean
          </span>{" "}
          — due Friday.
        </p>

        {/* Save status */}
        <div
          className="flex items-center gap-1.5 mt-4 text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "var(--color-success, #34d399)" }}
          />
          Saved
        </div>
      </div>
    </DemoShell>
  );
}

/* ---------------------------------------------------------------------------
 * Organization demo
 * Shows a sidebar-style workspace tree with spaces, folders, and pages.
 * --------------------------------------------------------------------------- */

type TreeNode = {
  name: string;
  type: "space" | "folder" | "page";
  children?: TreeNode[];
  active?: boolean;
};

const TREE: TreeNode[] = [
  {
    name: "Engineering",
    type: "space",
    children: [
      {
        name: "Architecture",
        type: "folder",
        children: [
          { name: "Data model v2", type: "page", active: true },
          { name: "API design", type: "page" },
        ],
      },
      { name: "Onboarding", type: "page" },
    ],
  },
  {
    name: "Product",
    type: "space",
    children: [
      { name: "Roadmap", type: "page" },
      { name: "User research", type: "page" },
    ],
  },
];

function TreeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const indent = depth * 12;
  const isSpace = node.type === "space";
  const isActive = node.active;

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-0.5 px-1 rounded text-xs cursor-default select-none"
        style={{
          paddingLeft: `${8 + indent}px`,
          backgroundColor: isActive
            ? `color-mix(in oklab, var(--color-accent) 10%, transparent)`
            : "transparent",
          color: isActive
            ? "var(--color-accent)"
            : isSpace
              ? "var(--foreground)"
              : "var(--muted-foreground)",
          fontWeight: isSpace ? 600 : 400,
        }}
      >
        {node.type === "folder" && (
          <svg
            className="w-3 h-3 shrink-0"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M2 3.5A1.5 1.5 0 013.5 2h2.672l1.328 2H12.5A1.5 1.5 0 0114 5.5v6A1.5 1.5 0 0112.5 13h-9A1.5 1.5 0 012 11.5v-8z" />
          </svg>
        )}
        {node.type === "page" && (
          <svg
            className="w-3 h-3 shrink-0"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M4 1.5A1.5 1.5 0 012.5 3v10A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5V5.621L9.879 2H4zm4.5.5l3 3h-3V2z" />
          </svg>
        )}
        {node.name}
      </div>
      {node.children?.map((child) => (
        <TreeItem key={child.name} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function OrganizationDemo() {
  return (
    <DemoShell title="marrow · my-workspace">
      <div className="flex gap-4">
        {/* Sidebar */}
        <div
          className="w-44 shrink-0 rounded-lg border p-2 space-y-0.5"
          style={{
            backgroundColor: "var(--muted)",
            borderColor: "var(--border)",
          }}
        >
          <div
            className="text-xs font-semibold tracking-widest uppercase px-2 pt-1 pb-2"
            style={{ color: "var(--muted-foreground)" }}
          >
            Spaces
          </div>
          {TREE.map((node) => (
            <TreeItem key={node.name} node={node} />
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 space-y-3">
          <div
            className="text-base font-semibold"
            style={{
              fontFamily: "var(--font-heading)",
              fontVariationSettings: "'SOFT' 40, 'wght' 600",
              color: "var(--foreground)",
            }}
          >
            Data model v2
          </div>
          <div
            className="text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            Engineering · Architecture
          </div>

          {/* Members chip row */}
          <div className="flex items-center gap-2 pt-1">
            {["owner", "editor", "viewer"].map((role) => (
              <span
                key={role}
                className="px-2 py-0.5 rounded-full text-xs border"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                {role}
              </span>
            ))}
          </div>

          <p
            className="text-xs leading-relaxed pt-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            Three roles keep access simple. Owners manage membership; editors
            write; viewers read.
          </p>
        </div>
      </div>
    </DemoShell>
  );
}

/* ---------------------------------------------------------------------------
 * Search demo
 * Cmd+K dialog mock with a query and ranked results.
 * --------------------------------------------------------------------------- */

const SEARCH_RESULTS = [
  {
    title: "Data model v2",
    space: "Engineering",
    snippet: "…nodes self-referential tree; type ∈ {folder, page}…",
    rank: 1,
  },
  {
    title: "API design",
    space: "Engineering",
    snippet: "…workspace tree endpoint for node hierarchy…",
    rank: 2,
  },
  {
    title: "Onboarding",
    space: "Engineering",
    snippet: "…start with docker compose up -d and open localhost:3000…",
    rank: 3,
  },
];

export function SearchDemo() {
  return (
    <DemoShell title="marrow · Search">
      {/* Dialog mock */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        {/* Input row */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
            style={{ color: "var(--muted-foreground)" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 19l-4-4m0-7A7 7 0 111 8a7 7 0 0114 0z"
            />
          </svg>
          <span
            className="text-sm flex-1"
            style={{ color: "var(--foreground)" }}
          >
            node tree
          </span>
          <kbd
            className="px-1.5 py-0.5 rounded text-xs border"
            style={{
              fontFamily: "var(--font-mono)",
              borderColor: "var(--border)",
              color: "var(--muted-foreground)",
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {SEARCH_RESULTS.map((result, i) => (
            <div
              key={result.title}
              className="flex items-start gap-3 px-4 py-3"
              style={{
                backgroundColor:
                  i === 0
                    ? `color-mix(in oklab, var(--color-accent) 6%, transparent)`
                    : "transparent",
              }}
            >
              <svg
                className="w-3.5 h-3.5 mt-0.5 shrink-0"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
                style={{ color: "var(--muted-foreground)" }}
              >
                <path d="M4 1.5A1.5 1.5 0 012.5 3v10A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5V5.621L9.879 2H4zm4.5.5l3 3h-3V2z" />
              </svg>
              <div className="min-w-0 flex-1">
                <div
                  className="text-sm font-medium"
                  style={{
                    color:
                      i === 0 ? "var(--color-accent)" : "var(--foreground)",
                  }}
                >
                  {result.title}
                </div>
                <div
                  className="text-xs mt-0.5 truncate"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {result.space} · {result.snippet}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DemoShell>
  );
}

/* ---------------------------------------------------------------------------
 * History demo
 * Revision list for a page showing the append-only stack.
 * --------------------------------------------------------------------------- */

const REVISIONS = [
  {
    id: "rev-4",
    label: "Current",
    time: "2 minutes ago",
    preview: "Added deployment section and docker-compose instructions.",
    current: true,
  },
  {
    id: "rev-3",
    label: "Rev 3",
    time: "1 hour ago",
    preview: "Expanded API routes table with node CRUD endpoints.",
    current: false,
  },
  {
    id: "rev-2",
    label: "Rev 2",
    time: "Yesterday",
    preview: "Initial draft — data model overview and tech stack.",
    current: false,
  },
  {
    id: "rev-1",
    label: "Rev 1",
    time: "3 days ago",
    preview: "Page created.",
    current: false,
  },
];

export function HistoryDemo() {
  return (
    <DemoShell title="marrow · Revision history">
      <div className="space-y-0">
        {REVISIONS.map((rev, i) => (
          <div
            key={rev.id}
            className="flex items-start gap-4 relative py-3"
          >
            {/* Timeline line */}
            {i < REVISIONS.length - 1 && (
              <div
                className="absolute left-[13px] top-8 bottom-0 w-px"
                style={{ backgroundColor: "var(--border)" }}
              />
            )}

            {/* Dot */}
            <div
              className="w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center mt-0.5"
              style={{
                borderColor: rev.current
                  ? "var(--color-accent)"
                  : "var(--border)",
                backgroundColor: rev.current
                  ? `color-mix(in oklab, var(--color-accent) 15%, transparent)`
                  : "var(--card)",
              }}
            >
              {rev.current && (
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: "var(--color-accent)" }}
                />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-xs font-semibold"
                  style={{
                    color: rev.current
                      ? "var(--color-accent)"
                      : "var(--foreground)",
                  }}
                >
                  {rev.label}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {rev.time}
                </span>
                {!rev.current && (
                  <button
                    className="text-xs ml-auto"
                    style={{ color: "var(--color-accent)" }}
                  >
                    Restore
                  </button>
                )}
              </div>
              <p
                className="text-xs mt-0.5 leading-snug"
                style={{ color: "var(--muted-foreground)" }}
              >
                {rev.preview}
              </p>
            </div>
          </div>
        ))}

        <p
          className="text-xs pt-2"
          style={{ color: "var(--muted-foreground)" }}
        >
          Revisions are immutable — every save is permanent, nothing is lost.
        </p>
      </div>
    </DemoShell>
  );
}
