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
  spaceName: string;
  ancestorNames: string[]; // folder ancestors, root → leaf parent of the node
}

/**
 * Walk the workspace tree to find a node by id. Returns the containing
 * space's name and the chain of ancestor folder names from the space root
 * down to (but not including) the node itself. Returns `null` if not found.
 */
export function findNodeBreadcrumb(
  tree: WorkspaceTree,
  nodeId: string,
): NodeBreadcrumb | null {
  for (const space of tree.spaces) {
    const found = walk(space.nodes, nodeId, []);
    if (found) {
      return { spaceName: space.name, ancestorNames: found };
    }
  }
  return null;
}

function walk(
  nodes: NodeTreeItem[],
  targetId: string,
  ancestors: string[],
): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return ancestors;
    if (node.children.length > 0) {
      const inner = walk(node.children, targetId, [...ancestors, node.name]);
      if (inner) return inner;
    }
  }
  return null;
}
