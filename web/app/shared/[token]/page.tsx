import Link from "next/link";

import { getSharedNode } from "@/lib/api";
import type { SharedNode } from "@/lib/types";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function SharedNodePage({ params }: Props) {
  const { token } = await params;

  let node: SharedNode;
  try {
    node = await getSharedNode(token);
  } catch (e) {
    const message = (e as Error).message;
    const expired = /410/.test(message);
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">
          {expired ? "Link no longer available" : "Link not found"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {expired
            ? "This share link has expired or been revoked."
            : "We couldn't find a shared resource at this URL."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 border-b border-border pb-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Shared {node.type}
        </div>
        <h1 className="mt-1 text-3xl font-semibold">{node.name}</h1>
        {node.description && (
          <p className="mt-2 text-muted-foreground">{node.description}</p>
        )}
      </header>

      {node.type === "page" && node.content && (
        <article className="prose prose-neutral max-w-none whitespace-pre-wrap dark:prose-invert">
          {node.content_format === "json" ? (
            <pre className="text-xs">{node.content}</pre>
          ) : (
            node.content
          )}
        </article>
      )}

      {node.type === "folder" && (
        <ul className="space-y-2">
          {node.children.length === 0 && (
            <li className="text-muted-foreground">This folder is empty.</li>
          )}
          {node.children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/shared/${token}/${child.slug}`}
                className="text-primary hover:underline"
              >
                {child.type === "folder" ? "📁 " : "📄 "}
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-12 border-t border-border pt-4 text-xs text-muted-foreground">
        Shared via Marrow — view-only access
      </footer>
    </main>
  );
}
