"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link as LinkIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  sharedLinkUrl,
} from "@/lib/api";
import type { ShareLink } from "@/lib/types";

interface Props {
  nodeId: string;
  nodeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ nodeId, nodeName, open, onOpenChange }: Props) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listShareLinks(nodeId)
      .then(setLinks)
      .catch(() => toast.error("Could not load share links"));
  }, [open, nodeId]);

  async function handleCreate() {
    setBusy(true);
    try {
      const link = await createShareLink(
        nodeId,
        expiresAt ? new Date(expiresAt).toISOString() : null
      );
      setLinks((prev) => [...prev, link]);
      setExpiresAt("");
    } catch {
      toast.error("Could not create share link");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeShareLink(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch {
      toast.error("Could not revoke link");
    }
  }

  async function handleCopy(token: string) {
    const url = sharedLinkUrl(token);
    await navigator.clipboard.writeText(url);
    setCopied(token);
    toast.success("Link copied");
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{nodeName}&rdquo;</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            Anyone with a link can view this content read-only — no account
            required. Sharing a folder shares its visible subtree.
          </p>

          <div className="flex items-end gap-2">
            <label className="flex-1 text-xs text-muted-foreground">
              Expires (optional)
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <Button onClick={handleCreate} disabled={busy}>
              <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
              Create link
            </Button>
          </div>

          <div className="space-y-2">
            {links.length === 0 && (
              <p className="text-xs text-muted-foreground">No active links.</p>
            )}
            {links.map((link) => (
              <div
                key={link.id}
                className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2"
              >
                <code className="flex-1 truncate text-[11px] text-muted-foreground">
                  {sharedLinkUrl(link.token)}
                </code>
                {link.expires_at && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    until {new Date(link.expires_at).toLocaleDateString()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(link.token)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  title="Copy link"
                >
                  {copied === link.token ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleRevoke(link.id)}
                  className="shrink-0 text-destructive hover:opacity-80"
                  title="Revoke link"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
