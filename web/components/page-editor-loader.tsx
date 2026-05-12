"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { Page } from "@/lib/types";
import { useWorkspaceTree } from "@/components/workspace-tree-context";
import { recordPageVisit } from "@/lib/recent-pages";

const PageEditor = dynamic(
  () => import("@/components/page-editor").then((m) => m.PageEditor),
  { ssr: false }
);

export function PageEditorLoader({ initialPage }: { initialPage: Page }) {
  const tree = useWorkspaceTree();
  useEffect(() => {
    if (!tree) return;
    recordPageVisit({
      workspaceId: tree.id,
      pageId: initialPage.id,
      title: initialPage.title,
      collectionId: initialPage.collection_id,
    });
  }, [tree, initialPage.id, initialPage.title, initialPage.collection_id]);
  return <PageEditor initialPage={initialPage} />;
}
