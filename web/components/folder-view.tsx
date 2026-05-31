"use client";

import { ChevronRight, FileText, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { listNodeChildren } from "@/lib/api";
import {
  findNodeBreadcrumb,
  useWorkspaceTree,
} from "@/components/workspace-tree-context";
import type { Node } from "@/lib/types";

interface Props {
  node: Node;
  workspaceId: string;
}

export function FolderView({ node, workspaceId }: Props) {
  const tree = useWorkspaceTree();
  const crumb = tree ? findNodeBreadcrumb(tree, node.id) : null;
  const [children, setChildren] = useState<Node[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listNodeChildren(node.id)
      .then((c) => {
        if (!cancelled) setChildren(c);
      })
      .catch(() => {
        if (!cancelled) setChildren([]);
      });
    return () => {
      cancelled = true;
    };
  }, [node.id]);

  const breadcrumbParts = crumb
    ? [crumb.spaceName, ...crumb.ancestors.map((a) => a.name), node.name]
    : [node.name];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[13px] text-muted-foreground">
          {breadcrumbParts.map((part, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              <span
                className={`truncate ${
                  i === breadcrumbParts.length - 1 ? "text-foreground" : ""
                }`}
              >
                {part}
              </span>
              {i < breadcrumbParts.length - 1 && (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              )}
            </span>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto px-10 py-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 flex items-center gap-3">
            <Folder className="h-7 w-7 text-muted-foreground" />
            <h1
              className="font-heading"
              style={{
                fontSize: 40,
                fontWeight: 400,
                letterSpacing: "-0.015em",
                fontVariationSettings: '"SOFT" 60',
              }}
            >
              {node.name}
            </h1>
          </div>
          {node.description && (
            <p className="mb-6 text-sm text-muted-foreground">{node.description}</p>
          )}

          {children === null && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {children !== null && children.length === 0 && (
            <p className="text-sm text-muted-foreground">This folder is empty.</p>
          )}
          {children !== null && children.length > 0 && (
            <ul className="flex flex-col gap-1">
              {children.map((child) => (
                <li key={child.id}>
                  <a
                    href={`/w/${workspaceId}/n/${child.id}/${child.slug}`}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    {child.type === "folder" ? (
                      <Folder className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-foreground">{child.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
