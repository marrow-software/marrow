"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { getOrg, listOrgMembers, getAuthStatus } from "@/lib/api";
import type { AuthStatus, Organization, OrgMembership } from "@/lib/types";
import { cn } from "@/lib/utils";

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

  const [org, setOrg] = useState<Organization | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [myMembership, setMyMembership] = useState<OrgMembership | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [o, m, a] = await Promise.all([
          getOrg(orgId),
          listOrgMembers(orgId).catch(() => [] as OrgMembership[]),
          getAuthStatus().catch(() => null),
        ]);
        if (cancelled) return;
        setOrg(o);
        setAuth(a);
        if (a?.user) {
          const mine = m.find((mm) => mm.user_id === a.user!.id) ?? null;
          setMyMembership(mine);
        }
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

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-muted/30 p-4 space-y-6">
        <div className="space-y-2">
          <Link
            href="/workspaces"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Workspaces
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </p>
            <h2 className="font-semibold truncate">{org?.name ?? "Organization"}</h2>
          </div>
        </div>

        <nav className="space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <li key={item.id}>
                      <Link
                        href={`${pathname}?section=${item.id}`}
                        className={cn(
                          "block rounded px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
