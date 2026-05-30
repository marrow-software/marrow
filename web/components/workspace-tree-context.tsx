"use client";

import { createContext, useContext } from "react";
import type { NodeTreeItem, WorkspaceTree } from "@/lib/types";

const WorkspaceTreeContext = createContext<WorkspaceTree | null>(null);

export function WorkspaceTreeProvider({
  tree,
  children,
}: {
  tree: WorkspaceTree;
  children: React.ReactNode;
}) {
  return <WorkspaceTreeContext value={tree}>{children}</WorkspaceTreeContext>;
}

export function useWorkspaceTree() {
  return useContext(WorkspaceTreeContext);
}

export interface NodeBreadcrumb {
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
  ancestors: NodeTreeItem[];
  node: NodeTreeItem;
}

function walk(
  nodes: NodeTreeItem[],
  nodeId: string,
  trail: NodeTreeItem[]
): { ancestors: NodeTreeItem[]; node: NodeTreeItem } | null {
  for (const n of nodes) {
    if (n.id === nodeId) {
      return { ancestors: trail, node: n };
    }
    const found = walk(n.children, nodeId, [...trail, n]);
    if (found) return found;
  }
  return null;
}

export function findNodeBreadcrumb(
  tree: WorkspaceTree,
  nodeId: string
): NodeBreadcrumb | null {
  for (const space of tree.spaces) {
    const found = walk(space.nodes, nodeId, []);
    if (found) {
      return {
        spaceId: space.id,
        spaceName: space.name,
        spaceSlug: space.slug,
        ancestors: found.ancestors,
        node: found.node,
      };
    }
  }
  return null;
}
