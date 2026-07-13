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

export function findNodeById(
  tree: WorkspaceTree,
  nodeId: string,
): NodeTreeItem | null {
  for (const space of tree.spaces) {
    const path = findPath(space.nodes, nodeId, []);
    if (path) return path[path.length - 1];
  }
  return null;
}

/** Post-archive navigation target: parent node, or workspace home when unknown. */
export function archiveDestinationPath(
  workspaceId: string,
  page: { parent_id: string | null },
  tree: WorkspaceTree | null,
): string {
  if (page.parent_id && tree) {
    const parent = findNodeById(tree, page.parent_id);
    if (parent) {
      return `/w/${workspaceId}/n/${parent.id}/${parent.slug}`;
    }
  }
  return `/w/${workspaceId}`;
}

export function countDescendants(node: NodeTreeItem): number {
  return node.children.reduce(
    (sum, child) => sum + 1 + countDescendants(child),
    0,
  );
}

/** All descendant page nodes under a folder at any depth (non-trashed tree only). */
export function collectDescendantPages(
  tree: WorkspaceTree,
  folderId: string,
): NodeTreeItem[] {
  const folder = findNodeById(tree, folderId);
  if (!folder) return [];
  const pages: NodeTreeItem[] = [];
  walkPages(folder.children, pages);
  return pages;
}

function walkPages(nodes: NodeTreeItem[], out: NodeTreeItem[]): void {
  for (const n of nodes) {
    if (n.type === "page") {
      out.push(n);
    } else {
      walkPages(n.children, out);
    }
  }
}

/** Direct child folders and pages of a folder node. */
export function collectDirectChildren(
  tree: WorkspaceTree,
  folderId: string,
): NodeTreeItem[] {
  const folder = findNodeById(tree, folderId);
  return folder?.children ?? [];
}

/**
 * @deprecated v0.1 collection-based breadcrumb. Always returns null in v0.2 —
 * callers should migrate to findNodeBreadcrumb. Kept as a no-op for incremental
 * migration of consumer components.
 */
export function findBreadcrumb(): { spaceName: string; collectionName: string } | null {
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
