"use client";

import dynamic from "next/dynamic";
import type { Node } from "@/lib/types";

const PageEditor = dynamic(
  () => import("@/components/page-editor").then((m) => m.PageEditor),
  { ssr: false }
);

export function PageEditorLoader({ initialPage }: { initialPage: Node }) {
  return <PageEditor initialPage={initialPage} />;
}
