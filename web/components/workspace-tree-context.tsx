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
  ancestorNames: string[]; // folder ancestors, root → leaf-parent
  nodeName: string;
}

export function findNodeBreadcrumb(
  tree: WorkspaceTree,
  nodeId: string,
): NodeBreadcrumb | null {
  for (const space of tree.spaces) {
    const path = findPath(space.nodes, nodeId, []);
    if (path) {
      const leaf = path[path.length - 1];
      const ancestors = path.slice(0, -1).map((n) => n.name);
      return { spaceName: space.name, ancestorNames: ancestors, nodeName: leaf.name };
    }
  }
  return null;
}

/**
 * @deprecated v0.1 collection-based breadcrumb. Always returns null in v0.2 —
 * callers should migrate to findNodeBreadcrumb. Kept as a no-op for incremental
 * migration of consumer components.
 */
export function findBreadcrumb(
  _tree: WorkspaceTree,
  _id: string,
): { spaceName: string; collectionName: string } | null {
  return null;
}

function findPath(
  nodes: NodeTreeItem[],
  targetId: string,
  trail: NodeTreeItem[],
): NodeTreeItem[] | null {
  for (const n of nodes) {
    const next = [...trail, n];
    if (n.id === targetId) return next;
    const inner = findPath(n.children, targetId, next);
    if (inner) return inner;
  }
  return null;
}
