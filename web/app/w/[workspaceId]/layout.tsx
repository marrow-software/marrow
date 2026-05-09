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

  const [auth, members, workspaces, orgs] = await Promise.all([
    getAuthStatus().catch(() => null),
    listOrgMembers(tree.org_id).catch(() => null),
    listWorkspaces().catch(() => [] as Awaited<ReturnType<typeof listWorkspaces>>),
    listOrgs().catch(() => [] as Awaited<ReturnType<typeof listOrgs>>),
  ]);

  const memberCount = members ? members.length : null;
  const showOrgSettings = workspaces.length > 1 || orgs.length > 1;

  return (
    <WorkspaceShell
      tree={tree}
      user={auth?.user ?? null}
      memberCount={memberCount}
      showOrgSettings={showOrgSettings}
    >
      {children}
    </WorkspaceShell>
  );
}
