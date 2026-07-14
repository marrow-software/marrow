import { notFound, redirect } from "next/navigation";
import { getNode } from "@/lib/api";
import { PageEditorLoader } from "@/components/page-editor-loader";

interface Props {
  params: Promise<{ workspaceId: string; nodeId: string; slug?: string[] }>;
}

export default async function NodeRoute({ params }: Props) {
  const { workspaceId, nodeId } = await params;

  let node;
  try {
    node = await getNode(nodeId);
  } catch {
    notFound();
    return; // unreachable at runtime but satisfies TypeScript narrowing
  }

  // Folders are sidebar tree containers only — not navigable pages.
  if (node.type === "folder") {
    redirect(`/w/${workspaceId}`);
  }

  return <PageEditorLoader initialPage={node} />;
}
