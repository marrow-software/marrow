"use client";

import { useMemo, useState } from "react";
import { Check, CornerDownRight, MessageSquare, Trash2, Undo2, X } from "lucide-react";

import type { Comment } from "@/lib/types";

interface Props {
  onClose: () => void;
  comments: Comment[];
  loading: boolean;
  error: string | null;
  post: (body: string, parentCommentId?: string) => Promise<void>;
  setResolved: (id: string, resolved: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CommentsDrawer({
  onClose,
  comments,
  loading,
  error,
  post,
  setResolved,
  remove,
}: Props) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { roots, repliesByParent, openCount } = useMemo(() => {
    const roots = comments.filter((c) => c.parent_comment_id === null);
    const repliesByParent = new Map<string, Comment[]>();
    for (const c of comments) {
      if (c.parent_comment_id) {
        const list = repliesByParent.get(c.parent_comment_id) ?? [];
        list.push(c);
        repliesByParent.set(c.parent_comment_id, list);
      }
    }
    const openCount = roots.filter((c) => c.resolved_at === null).length;
    return { roots, repliesByParent, openCount };
  }, [comments]);

  async function submit() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await post(body, replyTo ?? undefined);
      setDraft("");
      setReplyTo(null);
    } finally {
      setBusy(false);
    }
  }

  function renderComment(c: Comment, isReply: boolean) {
    const resolved = c.resolved_at !== null;
    return (
      <div
        key={c.id}
        className={`rounded-md border p-3 ${
          isReply ? "ml-5 mt-2 border-border/60" : "border-border"
        } ${resolved ? "border-dashed opacity-60" : ""}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            {c.author_name ?? "Unknown"}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {formatWhen(c.created_at)}
          </span>
          {resolved && (
            <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
              resolved
            </span>
          )}
          <span className="flex-1" />
          {!isReply && (
            <button
              type="button"
              onClick={() => setResolved(c.id, !resolved)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={resolved ? "Unresolve comment" : "Resolve comment"}
              title={resolved ? "Unresolve" : "Resolve"}
            >
              {resolved ? <Undo2 className="h-3 w-3" /> : <Check className="h-3 w-3" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => remove(c.id)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Delete comment"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-foreground">
          {c.body}
        </p>
        {!isReply && !resolved && (
          <button
            type="button"
            onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
            className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <CornerDownRight className="h-3 w-3" />
            {replyTo === c.id ? "Cancel reply" : "Reply"}
          </button>
        )}
      </div>
    );
  }

  return (
    <aside
      className="absolute inset-y-0 right-0 z-15 flex w-[380px] flex-col border-l border-border bg-card shadow-[-20px_0_40px_-20px_rgba(0,0,0,0.3)]"
      aria-label="Comments"
    >
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span
          className="text-base font-normal"
          style={{ fontVariationSettings: '"SOFT" 40' }}
        >
          Comments
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {openCount} open
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close comments"
        >
          <X className="h-3 w-3" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-auto px-4 py-5">
        {loading && (
          <p className="text-xs text-muted-foreground">Loading comments…</p>
        )}
        {error && !loading && (
          <p className="text-xs text-destructive">{error}</p>
        )}
        {!loading && !error && roots.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-5 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">No comments yet.</p>
            <p className="mt-2">Leave a comment below to start a thread.</p>
          </div>
        )}
        {roots.map((root) => (
          <div key={root.id}>
            {renderComment(root, false)}
            {(repliesByParent.get(root.id) ?? []).map((r) =>
              renderComment(r, true)
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border bg-popover p-3">
        <div className="rounded-md border border-border bg-background px-3 py-2.5">
          {replyTo && (
            <div className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <CornerDownRight className="h-3 w-3" />
              Replying to a thread
            </div>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            placeholder="Leave a comment…"
            className="w-full resize-none bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="flex-1 font-mono text-[10px] text-muted-foreground">
              ⌘↵ to send
            </span>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || draft.trim().length === 0}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {replyTo ? "Reply" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
