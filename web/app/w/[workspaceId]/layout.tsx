import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthStatus, getWorkspaceTree, listOrgMembers, listOrgs, listWorkspaces } from "@/lib/api";

interface Props {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceLayout({ children, params }: Props) {
  const { workspaceId } = await params;

  let tree;
  try {
    tree = await getWorkspaceTree(workspaceId);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("401")) {
      redirect("/login");
    }
    throw e;
  }

  const [auth, members, orgs, workspaces] = await Promise.all([
    getAuthStatus().catch(() => null),
    listOrgMembers(tree.org_id).catch(() => null),
    listOrgs().catch(() => null),
    listWorkspaces().catch(() => [] as Awaited<ReturnType<typeof listWorkspaces>>),
  ]);

  const memberCount = members ? members.length : null;
  const userMembership = members?.find((m) => m.user_id === auth?.user?.id) ?? null;
  const userRole = userMembership?.role ?? null;

  // Workspace-entry subscription gate: gate on *this* workspace's org. An owner
  // of an unsubscribed org is sent to checkout; a non-owner sees a notice.
  // has_active_subscription already accounts for SAAS_MODE off + enterprise.
  const thisOrg = orgs?.find((o) => o.id === tree.org_id) ?? null;
  if (thisOrg && !thisOrg.has_active_subscription) {
    if (userRole === "owner") {
      redirect(`/subscribe?org=${tree.org_id}`);
    }
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-xl font-semibold">Subscription required</h1>
          <p className="text-muted-foreground text-sm">
            This workspace&apos;s organization{thisOrg.name ? ` (${thisOrg.name})` : ""} doesn&apos;t
            have an active subscription. An organization owner needs to choose a plan before you can
            open it.
          </p>
          <a
            href="/home"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  // Hide org settings for solo users (exactly 1 org, that org has exactly 1 workspace).
  // Show as soon as user has 2+ orgs OR any org has 2+ workspaces.
  const showOrgSettings = (() => {
    if (!orgs || !workspaces) return true; // fail-open
    if (orgs.length !== 1) return true;
    const orgWorkspaces = workspaces.filter((ws) => ws.org_id === orgs[0].id);
    return orgWorkspaces.length !== 1;
  })();

  return (
    <WorkspaceShell
      tree={tree}
      user={auth?.user ?? null}
      memberCount={memberCount}
      showOrgSettings={showOrgSettings}
      workspaces={workspaces ?? []}
      userRole={userRole}
    >
      {children}
    </WorkspaceShell>
  );
}
