"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { listWorkspaces, listSpaces } from "@/lib/api";
import type { Space, Workspace } from "@/lib/types";

type Row = { workspace: Workspace; spaces: Space[] };

export function SpacesSection() {
  const { orgId } = useParams<{ orgId: string }>();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = (await listWorkspaces().catch(() => [] as Workspace[])).filter(
          (w) => w.org_id === orgId,
        );
        const data = await Promise.all(
          ws.map(async (w) => ({
            workspace: w,
            spaces: await listSpaces(w.id).catch(() => [] as Space[]),
          })),
        );
        if (!cancelled) setRows(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return (
    <div className="mx-auto max-w-4xl p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Spaces management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse all spaces in this organization, grouped by workspace.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading &&
        rows.map(({ workspace, spaces }) => (
          <section key={workspace.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{workspace.name}</h2>
              <span className="text-xs text-muted-foreground">{workspace.slug}</span>
            </div>
            <div className="divide-y rounded-md border bg-card">
              {spaces.map((s) => (
                <Link
                  key={s.id}
                  href={`/w/${workspace.id}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-accent transition-colors"
                >
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.slug}</span>
                </Link>
              ))}
              {spaces.length === 0 && (
                <p className="px-4 py-2.5 text-sm text-muted-foreground">No spaces.</p>
              )}
            </div>
          </section>
        ))}

      {!loading && rows.length === 0 && (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No workspaces in this organization yet.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Active / archived / trashed filtering will land alongside the trash workflow.
      </p>
    </div>
  );
}
