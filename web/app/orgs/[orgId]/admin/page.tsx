"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Activity,
  BarChart3,
  ScrollText,
  Zap,
  ShieldCheck,
  FolderTree,
  Megaphone,
  Download,
  Upload,
  UserCog,
  UsersRound,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getOrg,
  listOrgMembers,
  listWorkspaces,
  getAuthStatus,
  getWorkspaceTree,
} from "@/lib/api";
import type {
  Organization,
  OrgMembership,
  Workspace,
  AuthStatus,
  WorkspaceTree,
} from "@/lib/types";

type SectionId =
  | "mission-control"
  | "analytics"
  | "audit-log"
  | "automation"
  | "permissions-export"
  | "user-access"
  | "spaces"
  | "announcements"
  | "import"
  | "user-management"
  | "groups"
  | "billing";

type Section = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  status?: "soon" | "stub";
};

type SectionGroup = { label: string; sections: Section[] };

const GROUPS: SectionGroup[] = [
  {
    label: "Monitoring",
    sections: [
      { id: "mission-control", label: "Mission control", icon: Activity },
      { id: "analytics", label: "Analytics", icon: BarChart3, status: "soon" },
      { id: "audit-log", label: "Audit log", icon: ScrollText, status: "soon" },
    ],
  },
  {
    label: "Admin tools",
    sections: [
      { id: "automation", label: "Automation", icon: Zap, status: "soon" },
      {
        id: "permissions-export",
        label: "Export permissions data",
        icon: Download,
        status: "stub",
      },
      { id: "user-access", label: "User access", icon: ShieldCheck, status: "stub" },
      { id: "spaces", label: "Spaces management", icon: FolderTree, status: "stub" },
      { id: "announcements", label: "Announcements", icon: Megaphone, status: "stub" },
      { id: "import", label: "Import from other tools", icon: Upload, status: "stub" },
    ],
  },
  {
    label: "Organization",
    sections: [
      { id: "user-management", label: "User management", icon: UserCog },
      { id: "groups", label: "Groups", icon: UsersRound, status: "soon" },
      { id: "billing", label: "Billing", icon: CreditCard, status: "stub" },
    ],
  },
];

const ALL_SECTIONS: Section[] = GROUPS.flatMap((g) => g.sections);

function isSectionId(value: string | null): value is SectionId {
  return !!value && ALL_SECTIONS.some((s) => s.id === value);
}

export default function OrgAdminPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const activeSection: SectionId = isSectionId(sectionParam)
    ? sectionParam
    : "mission-control";

  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [trees, setTrees] = useState<Record<string, WorkspaceTree | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [o, m, ws, a] = await Promise.all([
          getOrg(orgId),
          listOrgMembers(orgId),
          listWorkspaces(),
          getAuthStatus(),
        ]);
        if (cancelled) return;
        setOrg(o);
        setMembers(m);
        setWorkspaces(ws.filter((w) => w.org_id === orgId));
        setAuth(a);
      } catch (err) {
        if (!cancelled) toast.error(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Fetch trees for workspaces in this org so we can compute mission-control counts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results: Record<string, WorkspaceTree | null> = {};
      await Promise.all(
        workspaces.map(async (w) => {
          try {
            results[w.id] = await getWorkspaceTree(w.id);
          } catch {
            results[w.id] = null;
          }
        })
      );
      if (!cancelled) setTrees(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaces]);

  const currentRole = useMemo(() => {
    if (!auth?.user) return null;
    const m = members.find((mm) => mm.user_id === auth.user!.id);
    return m?.role ?? null;
  }, [auth, members]);

  // API-key / anonymous methods bypass RBAC; treat as owner-equivalent for the gate.
  const isOwner =
    currentRole === "owner" ||
    auth?.method === "api_key" ||
    auth?.method === "anonymous";

  function selectSection(id: SectionId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", id);
    router.replace(`/orgs/${orgId}/admin?${params.toString()}`);
  }

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  if (!org) {
    return <div className="p-8 text-muted-foreground">Organization not found.</div>;
  }

  if (auth?.authenticated && !isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 space-y-4">
        <Link
          href="/workspaces"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Workspaces
        </Link>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          You need the <span className="font-medium">owner</span> role on{" "}
          <span className="font-medium">{org.name}</span> to access the admin dashboard.
          Your current role is <span className="font-medium">{currentRole ?? "none"}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside className="w-64 shrink-0 border-r bg-muted/30 flex flex-col">
        <div className="px-4 py-4 border-b space-y-2">
          <Link
            href="/workspaces"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Workspaces
          </Link>
          <div>
            <h1 className="text-sm font-semibold leading-tight">{org.name}</h1>
            <p className="text-xs text-muted-foreground">Admin dashboard</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                {group.label}
              </p>
              {group.sections.map((s) => {
                const Icon = s.icon;
                const active = s.id === activeSection;
                return (
                  <button
                    key={s.id}
                    onClick={() => selectSection(s.id)}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors",
                      active
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate flex-1">{s.label}</span>
                    {s.status === "soon" && (
                      <Badge variant="outline" className="text-[9px]">
                        Soon
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-8">
          <SectionView
            section={activeSection}
            org={org}
            members={members}
            workspaces={workspaces}
            trees={trees}
          />
        </div>
      </main>
    </div>
  );
}

function SectionView(props: {
  section: SectionId;
  org: Organization;
  members: OrgMembership[];
  workspaces: Workspace[];
  trees: Record<string, WorkspaceTree | null>;
}) {
  const { section, org, members, workspaces, trees } = props;

  switch (section) {
    case "mission-control":
      return <MissionControl org={org} members={members} workspaces={workspaces} trees={trees} />;
    case "user-management":
      return <UserManagement org={org} />;
    case "analytics":
      return (
        <Stub
          title="Analytics"
          description="Workspace-level activity charts, top contributors, and content trends."
        />
      );
    case "audit-log":
      return (
        <Stub
          title="Audit log"
          description="A searchable log of admin and content actions. Requires the audit_events table — backend work pending."
        />
      );
    case "automation":
      return (
        <Stub
          title="Automation"
          description="Rules and triggers (e.g., archive stale pages, route mentions). Coming later."
        />
      );
    case "permissions-export":
      return (
        <Stub
          title="Export permissions data"
          description="Download a CSV of every member, role, and the spaces they can access."
        />
      );
    case "user-access":
      return (
        <Stub
          title="User access"
          description="Browse who can see what across spaces and pages."
        />
      );
    case "spaces":
      return <SpacesManagement workspaces={workspaces} trees={trees} />;
    case "announcements":
      return (
        <Stub
          title="Announcements"
          description="Post org-wide banners shown above every workspace."
        />
      );
    case "import":
      return (
        <Stub
          title="Import from other tools"
          description="Bring content in from Confluence, Notion, and Markdown archives."
        />
      );
    case "groups":
      return (
        <Stub
          title="Groups"
          description="Group members and manage access by group rather than per-person."
        />
      );
    case "billing":
      return (
        <Stub
          title="Billing"
          description="Marrow is self-hosted and free under Apache 2.0 — no billing here yet."
        />
      );
  }
}

function MissionControl(props: {
  org: Organization;
  members: OrgMembership[];
  workspaces: Workspace[];
  trees: Record<string, WorkspaceTree | null>;
}) {
  const { org, members, workspaces, trees } = props;

  const treeValues = Object.values(trees).filter(
    (t): t is WorkspaceTree => t !== null
  );
  const spaceCount = treeValues.reduce((acc, t) => acc + t.spaces.length, 0);
  const collectionCount = treeValues.reduce(
    (acc, t) => acc + t.spaces.reduce((a, s) => a + s.collections.length, 0),
    0
  );
  const pageCount = treeValues.reduce(
    (acc, t) =>
      acc +
      t.spaces.reduce(
        (a, s) => a + s.collections.reduce((b, c) => b + c.pages.length, 0),
        0
      ),
    0
  );
  const treesLoading = workspaces.length > 0 && treeValues.length === 0;
  const treesPartial = workspaces.length > treeValues.length;

  const owners = members.filter((m) => m.role === "owner").length;
  const editors = members.filter((m) => m.role === "editor").length;
  const viewers = members.filter((m) => m.role === "viewer").length;
  const pending = members.filter((m) => m.user_id === null).length;

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold">Mission control</h2>
        <p className="text-sm text-muted-foreground">
          Overview of {org.name}.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Workspaces" value={workspaces.length} />
        <StatCard label="Spaces" value={treesLoading ? "…" : spaceCount} />
        <StatCard label="Collections" value={treesLoading ? "…" : collectionCount} />
        <StatCard label="Pages" value={treesLoading ? "…" : pageCount} />
      </section>

      {treesPartial && !treesLoading && (
        <p className="text-xs text-muted-foreground">
          Some workspace counts are unavailable — the v0.2 tree endpoint may not
          be live for every workspace yet.
        </p>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Members" value={members.length} />
        <StatCard label="Owners" value={owners} />
        <StatCard label="Editors" value={editors} />
        <StatCard label="Viewers" value={viewers} />
      </section>

      {pending > 0 && (
        <p className="text-xs text-amber-600">
          {pending} pending invite{pending === 1 ? "" : "s"} — these members
          haven&apos;t signed in yet.
        </p>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Workspaces</h3>
        <div className="divide-y rounded-md border">
          {workspaces.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No workspaces in this org yet.
            </p>
          )}
          {workspaces.map((w) => {
            const t = trees[w.id];
            const wsSpaces = t?.spaces.length ?? 0;
            const wsPages =
              t?.spaces.reduce(
                (a, s) =>
                  a + s.collections.reduce((b, c) => b + c.pages.length, 0),
                0
              ) ?? 0;
            return (
              <div
                key={w.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/w/${w.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {w.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">/{w.slug}</p>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {t === null ? "—" : `${wsSpaces} spaces · ${wsPages} pages`}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function UserManagement({ org }: { org: Organization }) {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-bold">User management</h2>
        <p className="text-sm text-muted-foreground">
          Invite members, change roles, and remove access.
        </p>
      </header>
      <p className="text-sm">
        Member administration lives on the org settings page.
      </p>
      <Button render={<Link href={`/orgs/${org.id}/settings`} />}>
        Open member settings
      </Button>
    </div>
  );
}

function SpacesManagement(props: {
  workspaces: Workspace[];
  trees: Record<string, WorkspaceTree | null>;
}) {
  const allSpaces = props.workspaces.flatMap((w) => {
    const t = props.trees[w.id];
    return (t?.spaces ?? []).map((s) => ({ workspace: w, space: s }));
  });
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-bold">Spaces management</h2>
        <p className="text-sm text-muted-foreground">
          Active spaces across all workspaces in this org. Archive and trash
          views are coming soon.
        </p>
      </header>
      <div className="divide-y rounded-md border">
        {allSpaces.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No spaces yet.
          </p>
        )}
        {allSpaces.map(({ workspace, space }) => (
          <div
            key={`${workspace.id}:${space.id}`}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{space.name}</p>
              <p className="text-xs text-muted-foreground">
                {workspace.name} · /{space.slug}
              </p>
            </div>
            <Badge variant="outline">active</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Stub({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-3">
      <header>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Not built yet — placeholder section.
        </p>
      </div>
    </div>
  );
}
