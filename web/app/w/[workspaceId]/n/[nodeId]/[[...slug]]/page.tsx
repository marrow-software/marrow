import Link from "next/link";
import { ChevronRight, Folder } from "lucide-react";
import { getNode, listNodeChildren } from "@/lib/api";
import { PageEditorLoader } from "@/components/page-editor-loader";
import type { Node } from "@/lib/types";

interface Props {
  params: Promise<{ workspaceId: string; nodeId: string; slug?: string[] }>;
}

export default async function NodeRoute({ params }: Props) {
  const { workspaceId, nodeId } = await params;
  const node = await getNode(nodeId);

  if (node.type === "page") {
    return <PageEditorLoader initialPage={node} />;
  }

  const children = await listNodeChildren(nodeId).catch(() => [] as Node[]);
  return <FolderView workspaceId={workspaceId} folder={node} children={children} />;
}

function FolderView({
  workspaceId,
  folder,
  children,
}: {
  workspaceId: string;
  folder: Node;
  children: Node[];
}) {
  const sorted = [...children].sort((a, b) => a.position.localeCompare(b.position));

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-6 py-3 font-mono text-[13px] text-muted-foreground">
        <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
        <span className="truncate text-foreground">{folder.name}</span>
      </header>
      <div className="flex-1 overflow-auto px-10 py-10">
        <div className="mb-6 flex items-start gap-3">
          <Folder className="mt-1 h-6 w-6 text-muted-foreground" />
          <div>
            <h1
              className="font-heading text-3xl"
              style={{ fontVariationSettings: '"SOFT" 60', letterSpacing: "-0.015em" }}
            >
              {folder.name}
            </h1>
            {folder.description && (
              <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                {folder.description}
              </p>
            )}
          </div>
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">This folder is empty.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {sorted.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/w/${workspaceId}/n/${child.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent"
                >
                  <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
                    {child.type === "folder" ? (
                      <Folder className="h-4 w-4" />
                    ) : (
                      <span className="text-[11px]">·</span>
                    )}
                  </span>
                  <span className="flex-1 truncate text-foreground">{child.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {child.type}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
