"use client";

import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  shareLinkUrl,
} from "@/lib/api";
import type { ShareLink } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
}

export function ShareDialog({ open, onOpenChange, nodeId }: Props) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    listShareLinks(nodeId)
      .then(setLinks)
      .catch((e) => toast.error(`Failed to load share links: ${e.message}`));
  }, [open, nodeId]);

  async function handleCreate() {
    setLoading(true);
    try {
      const iso = expiresAt ? new Date(expiresAt).toISOString() : null;
      const link = await createShareLink(nodeId, iso);
      setLinks((prev) => [link, ...prev]);
      setExpiresAt("");
      toast.success("Share link created");
    } catch (e) {
      toast.error(`Failed to create link: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeShareLink(id);
      setLinks((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, revoked_at: new Date().toISOString() } : l,
        ),
      );
      toast.success("Share link revoked");
    } catch (e) {
      toast.error(`Failed to revoke: ${(e as Error).message}`);
    }
  }

  function handleCopy(token: string) {
    const url = shareLinkUrl(token);
    void navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  }

  function statusOf(link: ShareLink): "active" | "expired" | "revoked" {
    if (link.revoked_at) return "revoked";
    if (link.expires_at && new Date(link.expires_at) < new Date()) return "expired";
    return "active";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share view-only link</DialogTitle>
          <DialogDescription>
            Anyone with the link can read this content without signing in.
            Sharing a folder also shares its contents.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">
              Expires (optional)
            </label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <Button onClick={handleCreate} disabled={loading}>
            Create link
          </Button>
        </div>

        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {links.length === 0 && (
            <p className="text-sm text-muted-foreground">No share links yet.</p>
          )}
          {links.map((link) => {
            const status = statusOf(link);
            const url = shareLinkUrl(link.token);
            return (
              <div
                key={link.id}
                className="flex items-center gap-2 rounded-md border border-border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs">{url}</div>
                  <div className="text-xs text-muted-foreground">
                    {status === "active" && link.expires_at && (
                      <>Expires {new Date(link.expires_at).toLocaleString()}</>
                    )}
                    {status === "active" && !link.expires_at && <>Never expires</>}
                    {status === "expired" && <>Expired</>}
                    {status === "revoked" && <>Revoked</>}
                  </div>
                </div>
                {status === "active" && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopy(link.token)}
                      aria-label="Copy link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRevoke(link.id)}
                      aria-label="Revoke link"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
