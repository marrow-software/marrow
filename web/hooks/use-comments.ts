"use client";

/**
 * useComments — page-level comment thread state (#101).
 *
 * Unread heuristic (v1, deliberately simple): the timestamp of the viewer's
 * last visit to a node's comments is stored in localStorage. Any comment
 * created after that mark — and not authored by no one — counts as unread.
 * Opening the drawer calls `markVisited()` to clear the badge.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createComment,
  deleteComment,
  listComments,
  updateComment,
} from "@/lib/api";
import type { Comment } from "@/lib/types";

function visitKey(nodeId: string): string {
  return `marrow:comment-visit:${nodeId}`;
}

function lastVisit(nodeId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(visitKey(nodeId));
  return raw ? Number(raw) : 0;
}

export function useComments(nodeId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visitMark, setVisitMark] = useState(0);

  useEffect(() => {
    setVisitMark(lastVisit(nodeId));
  }, [nodeId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setComments(await listComments(nodeId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markVisited = useCallback(() => {
    const now = Date.now();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(visitKey(nodeId), String(now));
    }
    setVisitMark(now);
  }, [nodeId]);

  const unreadCount = useMemo(
    () =>
      comments.filter((c) => new Date(c.created_at).getTime() > visitMark)
        .length,
    [comments, visitMark]
  );

  const post = useCallback(
    async (body: string, parentCommentId?: string) => {
      const created = await createComment(nodeId, body, parentCommentId);
      setComments((prev) => [...prev, created]);
    },
    [nodeId]
  );

  const edit = useCallback(async (id: string, body: string) => {
    const updated = await updateComment(id, { body });
    setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  const setResolved = useCallback(async (id: string, resolved: boolean) => {
    const updated = await updateComment(id, { resolved });
    setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteComment(id);
    setComments((prev) =>
      prev.filter((c) => c.id !== id && c.parent_comment_id !== id)
    );
  }, []);

  return {
    comments,
    loading,
    error,
    unreadCount,
    refresh,
    markVisited,
    post,
    edit,
    setResolved,
    remove,
  };
}
