import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  getAuthStatus,
  getWorkspace,
  getWorkspaceTree,
  listOrgMembers,
} from "@/lib/api";

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

  // The /tree endpoint doesn't include org_id; fetch the workspace for it.
  const workspace = await getWorkspace(workspaceId).catch(() => null);
  const treeWithOrg = workspace
    ? { ...tree, org_id: workspace.org_id }
    : tree;

  const auth = await getAuthStatus().catch(() => null);
  const members = workspace
    ? await listOrgMembers(workspace.org_id).catch(() => null)
    : null;
  const memberCount = members ? members.length : null;

  return (
    <WorkspaceShell tree={treeWithOrg} user={auth?.user ?? null} memberCount={memberCount}>
      {children}
    </WorkspaceShell>
  );
}
