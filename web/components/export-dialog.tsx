"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getExportSizeEstimate, exportWorkspaceUrl } from "@/lib/api";

interface Props {
  workspaceId: string;
  workspaceName: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExportDialog({ workspaceId, workspaceName }: Props) {
  const [open, setOpen] = useState(false);
  const [slim, setSlim] = useState(false);
  const [includeTrash, setIncludeTrash] = useState(false);
  const [estimate, setEstimate] = useState<{ full_bytes: number; slim_bytes: number } | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

  async function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && !estimate) {
      setLoadingEstimate(true);
      try {
        const sizes = await getExportSizeEstimate(workspaceId);
        setEstimate(sizes);
      } catch {
        // Estimate is non-critical — continue without it
      } finally {
        setLoadingEstimate(false);
      }
    }
  }

  function handleDownload() {
    const url = exportWorkspaceUrl(workspaceId, { slim, includeTrash });
    window.location.href = url;
    setOpen(false);
  }

  const estimatedBytes = estimate ? (slim ? estimate.slim_bytes : estimate.full_bytes) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={<button type="button" className="contents" />}>
        <span
          className="hidden group-hover:flex items-center text-muted-foreground hover:text-foreground cursor-pointer"
          title="Export workspace"
        >
          <Download className="h-3.5 w-3.5" />
        </span>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Export &ldquo;{workspaceName}&rdquo;</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="export-mode"
                value="full"
                checked={!slim}
                onChange={() => setSlim(false)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">Full export</p>
                <p className="text-xs text-muted-foreground">
                  Includes complete revision history. Use this to fully migrate or back up your
                  workspace.
                </p>
                {estimate && !loadingEstimate && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ~{formatBytes(estimate.full_bytes)} uncompressed
                  </p>
                )}
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="export-mode"
                value="slim"
                checked={slim}
                onChange={() => setSlim(true)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">Slim export</p>
                <p className="text-xs text-muted-foreground">
                  Current content only — no revision history. Smaller file, but history cannot be
                  restored.
                </p>
                {estimate && !loadingEstimate && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ~{formatBytes(estimate.slim_bytes)} uncompressed
                  </p>
                )}
              </div>
            </label>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTrash}
              onChange={(e) => setIncludeTrash(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium">Include trash</p>
              <p className="text-xs text-muted-foreground">
                Export soft-deleted nodes with their <code className="text-xs">deleted_at</code>{" "}
                timestamps so trash is preserved on restore.
              </p>
            </div>
          </label>

          {slim && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">
              Slim exports cannot restore revision history. Use full export if you need a complete
              backup.
            </p>
          )}

          {loadingEstimate && (
            <p className="text-xs text-muted-foreground">Calculating size estimate…</p>
          )}

          {estimatedBytes !== null && !loadingEstimate && (
            <p className="text-xs text-muted-foreground">
              Estimated size: ~{formatBytes(estimatedBytes)} uncompressed (actual zip will be
              smaller)
            </p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleDownload}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
