"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, FolderTree, Layers, Users } from "lucide-react";
import { listWorkspaces, listOrgMembers, listSpaces } from "@/lib/api";
import type { OrgMembership, Space, Workspace } from "@/lib/types";

export function MissionControlSection() {
  const { orgId } = useParams<{ orgId: string }>();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [spacesByWorkspace, setSpacesByWorkspace] = useState<Record<string, Space[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, mm] = await Promise.all([
          listWorkspaces().catch(() => [] as Workspace[]),
          listOrgMembers(orgId).catch(() => [] as OrgMembership[]),
        ]);
        if (cancelled) return;
        const orgWs = ws.filter((w) => w.org_id === orgId);
        setWorkspaces(orgWs);
        setMembers(mm);

        const spaceEntries = await Promise.all(
          orgWs.map(async (w) => {
            const ss = await listSpaces(w.id).catch(() => [] as Space[]);
            return [w.id, ss] as const;
          }),
        );
        if (cancelled) return;
        setSpacesByWorkspace(Object.fromEntries(spaceEntries));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const totalSpaces = Object.values(spacesByWorkspace).reduce((sum, s) => sum + s.length, 0);
  const activeMembers = members.filter((m) => m.user_id !== null).length;
  const pendingMembers = members.length - activeMembers;

  return (
    <div className="mx-auto max-w-5xl p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Mission control</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A high-level view of your organization.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Layers className="h-4 w-4" />}
          label="Workspaces"
          value={loading ? "…" : String(workspaces.length)}
        />
        <StatCard
          icon={<FolderTree className="h-4 w-4" />}
          label="Spaces"
          value={loading ? "…" : String(totalSpaces)}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Members"
          value={loading ? "…" : String(activeMembers)}
          hint={pendingMembers > 0 ? `${pendingMembers} pending` : undefined}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Workspaces</h2>
        <div className="divide-y rounded-md border bg-card">
          {workspaces.map((w) => {
            const spaces = spacesByWorkspace[w.id] ?? [];
            return (
              <Link
                key={w.id}
                href={`/w/${w.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {spaces.length} space{spaces.length === 1 ? "" : "s"} · {w.slug}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
          {!loading && workspaces.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">No workspaces yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
