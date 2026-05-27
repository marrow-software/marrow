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

  const auth = await getAuthStatus().catch(() => null);
  const members = await listOrgMembers(tree.org_id).catch(() => null);
  const memberCount = members ? members.length : null;

  const [orgs, workspaces] = await Promise.all([
    listOrgs().catch(() => null),
    listWorkspaces().catch(() => null),
  ]);

  // Hide org settings for solo users (exactly 1 org, that org has exactly 1 workspace).
  // Show as soon as user has 2+ orgs OR any org has 2+ workspaces.
  const showOrgSettings = (() => {
    if (!orgs || !workspaces) return true; // fail-open
    if (orgs.length !== 1) return true;
    const orgWorkspaces = workspaces.filter((ws) => ws.org_id === orgs[0].id);
    return orgWorkspaces.length !== 1;
  })();

  return (
    <WorkspaceShell tree={tree} user={auth?.user ?? null} memberCount={memberCount} showOrgSettings={showOrgSettings}>
      {children}
    </WorkspaceShell>
  );
}
