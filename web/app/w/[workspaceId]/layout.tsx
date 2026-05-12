import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  getAuthStatus,
  getWorkspaceTree,
  listOrgMembers,
  listOrgs,
  listWorkspaces,
} from "@/lib/api";
import type { Organization, OrgMembership, Workspace } from "@/lib/types";

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

  const auth = await getAuthStatus().catch(() => null);
  const members = await listOrgMembers(tree.org_id).catch(() => null);
  const memberCount = members ? members.length : null;

  const workspaces: Workspace[] = await listWorkspaces().catch(() => []);
  const orgs: Organization[] = await listOrgs().catch(() => []);

  // Compute which orgs the current user can create workspaces in.
  // Individual orgs: any member can; Organization orgs: OWNER role required.
  // Look up the user's role across their orgs in parallel.
  const userMemberships: Record<string, OrgMembership["role"]> = {};
  if (auth?.user) {
    const results = await Promise.all(
      orgs.map((o) => listOrgMembers(o.id).catch(() => [] as OrgMembership[]))
    );
    for (let i = 0; i < orgs.length; i++) {
      const mine = results[i].find((m) => m.user_id === auth.user!.id);
      if (mine) userMemberships[orgs[i].id] = mine.role;
    }
  }

  return (
    <WorkspaceShell
      tree={tree}
      user={auth?.user ?? null}
      memberCount={memberCount}
      workspaces={workspaces}
      orgs={orgs}
      userMemberships={userMemberships}
    >
      {children}
    </WorkspaceShell>
  );
}
