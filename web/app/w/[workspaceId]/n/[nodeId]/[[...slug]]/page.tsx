import { getNode } from "@/lib/api";
import { PageEditorLoader } from "@/components/page-editor-loader";
import { FolderView } from "@/components/folder-view";

interface Props {
  params: Promise<{ workspaceId: string; nodeId: string; slug?: string[] }>;
}

export default async function NodeRoute({ params }: Props) {
  const { workspaceId, nodeId } = await params;
  const node = await getNode(nodeId);

  if (node.type === "folder") {
    return <FolderView node={node} workspaceId={workspaceId} />;
  }

  return <PageEditorLoader initialPage={node} />;
}
