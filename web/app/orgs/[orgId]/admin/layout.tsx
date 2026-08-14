"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { getOrg, listOrgMembers, getAuthStatus, listWorkspaces } from "@/lib/api";
import type { AuthStatus, Organization, OrgMembership, Workspace } from "@/lib/types";
import { initials } from "@/lib/utils";
import { navRowClass } from "@/components/sidebar/row-styles";

type SectionDef = { id: string; label: string };
type GroupDef = { label: string; items: SectionDef[] };

const NAV_GROUPS: GroupDef[] = [
  {
    label: "Monitoring",
    items: [
      { id: "mission-control", label: "Mission control" },
      { id: "analytics", label: "Analytics" },
      { id: "audit-log", label: "Audit log" },
    ],
  },
  {
    label: "Admin tools",
    items: [
      { id: "automation", label: "Automation" },
      { id: "export-permissions", label: "Export permissions data" },
      { id: "access", label: "User access" },
      { id: "spaces", label: "Spaces management" },
      { id: "announcements", label: "Announcements" },
      { id: "import", label: "Import from other tools" },
    ],
  },
  {
    label: "Organization",
    items: [
      { id: "users", label: "User management" },
      { id: "groups", label: "Groups" },
      { id: "billing", label: "Billing" },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSection = searchParams.get("section") ?? "mission-control";
  // The workspace the user opened settings from (#317). Entry points pass it so
  // the "Back to [workspace]" row can return to the exact tree; deep links that
  // omit it fall back to Home.
  const fromWorkspace = searchParams.get("ws");

  const [org, setOrg] = useState<Organization | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [myMembership, setMyMembership] = useState<OrgMembership | null>(null);
  const [backWorkspace, setBackWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [o, m, a, ws] = await Promise.all([
          getOrg(orgId),
          listOrgMembers(orgId).catch(() => [] as OrgMembership[]),
          getAuthStatus().catch(() => null),
          fromWorkspace
            ? listWorkspaces().catch(() => [] as Workspace[])
            : Promise.resolve([] as Workspace[]),
        ]);
        if (cancelled) return;
        setOrg(o);
        setAuth(a);
        if (a?.user) {
          const mine = m.find((mm) => mm.user_id === a.user!.id) ?? null;
          setMyMembership(mine);
        }
        setBackWorkspace(fromWorkspace ? ws.find((w) => w.id === fromWorkspace) ?? null : null);
      } catch (err) {
        if (!cancelled) toast.error(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, fromWorkspace]);

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading admin…</div>;
  }

  // Permission: anonymous mode and API-key auth bypass RBAC (per CLAUDE.md).
  // For OIDC-authenticated sessions, require owner role to access admin.
  const isOidc = auth?.authenticated && auth.method === "session";
  if (isOidc && myMembership && myMembership.role !== "owner") {
    return (
      <div className="mx-auto max-w-xl p-12 text-center space-y-4">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Admin access required</h1>
        <p className="text-sm text-muted-foreground">
          Only organization owners can view the admin dashboard.
        </p>
        <Link
          href="/workspaces"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to workspaces
        </Link>
      </div>
    );
  }

  // "Back to [workspace]" (#317). Prefer the origin workspace passed via ?ws=;
  // otherwise fall back to Home so the row is never a dead end.
  const backHref = backWorkspace ? `/w/${backWorkspace.id}` : "/home";
  const backLabel = backWorkspace ? `Back to ${backWorkspace.name}` : "Back to Home";

  // Settings replaces the tree in place (#317): one unified sidebar column that
  // mirrors the workspace shell's chrome — a "Back to [workspace]" row above the
  // settings menu, the menu at the shared --text-base scale, and a full-width
  // main pane. No orphan two-column admin screen.
  return (
    <div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
      <aside
        className="flex h-full w-[264px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-base text-sidebar-foreground"
        aria-label="Settings navigation"
      >
        {/* Back row — returns to the space tree it came from (or Home). */}
        <Link
          href={backHref}
          className="signal-flat signal-focus flex items-center gap-2 border-b border-sidebar-border px-3 py-3 text-base font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{backLabel}</span>
        </Link>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-2">
              <p className="px-2 pb-1 pt-2 font-mono text-2xs font-semibold uppercase tracking-widest text-faint">
                {group.label}
              </p>
              <ul className="flex flex-col gap-px">
                {group.items.map((item) => {
                  const isActive = activeSection === item.id;
                  const href = fromWorkspace
                    ? `${pathname}?section=${item.id}&ws=${fromWorkspace}`
                    : `${pathname}?section=${item.id}`;
                  return (
                    <li key={item.id}>
                      <Link
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        className={navRowClass(isActive)}
                      >
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {auth?.user && (
          <div className="mt-auto flex items-center gap-2.5 border-t border-sidebar-border px-3 py-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground text-xs font-medium text-background">
              {initials(auth.user.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium text-foreground">
                {auth.user.name}
              </span>
              <span className="block truncate text-xs text-faint">
                {org?.name ?? auth.user.email}
              </span>
            </span>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
