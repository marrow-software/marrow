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

function findNodePath(nodes: NodeTreeItem[], targetId: string): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return [node.name];
    const sub = findNodePath(node.children, targetId);
    if (sub) return [node.name, ...sub];
  }
  return null;
}

export function findBreadcrumb(tree: WorkspaceTree, nodeId: string) {
  for (const space of tree.spaces) {
    const path = findNodePath(space.nodes, nodeId);
    if (path) {
      return { spaceName: space.name, nodePath: path };
    }
  }
  return null;
}
