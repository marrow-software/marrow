"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortalSession, listOrgs, reconcileSubscription } from "@/lib/api";
import { postGateRedirectPath } from "@/lib/post-gate-redirect";
import { Button } from "@/components/ui/button";

// Stripe redirects back here before the webhook is guaranteed to have landed.
// Instead of waiting on the webhook, actively reconcile: pull subscription
// truth from Stripe via the API and persist it. A few retries absorb the race
// where the trial subscription isn't queryable the instant Checkout finishes.
// On final failure we show a terminal Retry/support state — never a silent
// forward to /home, which the subscription gate would just bounce back here.
const MAX_ATTEMPTS = 5;
const RETRY_MS = 2000;

function SuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  const orgParam = params.get("org");

  const [phase, setPhase] = useState<"confirming" | "failed">("confirming");
  const [slow, setSlow] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function resolveOrgId(): Promise<string | null> {
      if (orgParam) return orgParam;
      const orgs = await listOrgs();
      return (orgs.find((o) => !o.has_active_subscription) ?? orgs[0])?.id ?? null;
    }

    async function confirm() {
      let orgId: string | null = null;
      try {
        orgId = await resolveOrgId();
      } catch {
        // fall through to the failure state below
      }
      for (let attempt = 0; orgId && attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;
        if (attempt >= 2) setSlow(true);
        try {
          const result = await reconcileSubscription(orgId);
          if (result.has_active_subscription) {
            const path = await postGateRedirectPath();
            router.replace(path);
            return;
          }
        } catch {
          // transient API error — retry
        }
        await new Promise((r) => setTimeout(r, RETRY_MS));
      }
      if (!cancelled) setPhase("failed");
    }

    setPhase("confirming");
    setSlow(false);
    confirm();
    return () => {
      cancelled = true;
    };
  }, [orgParam, router, runId]);

  const openPortal = useCallback(async () => {
    if (!orgParam) return;
    setPortalBusy(true);
    try {
      const { url } = await createPortalSession(orgParam);
      window.location.assign(url);
    } catch {
      setPortalBusy(false);
    }
  }, [orgParam]);

  if (phase === "failed") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">We couldn&apos;t confirm your payment</h1>
          <p className="text-muted-foreground text-sm">
            Your checkout may still be processing on Stripe&apos;s side. You haven&apos;t been
            charged twice — retry the confirmation, or check your subscription in the billing
            portal.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => setRunId((n) => n + 1)}>Retry</Button>
            {orgParam && (
              <Button variant="outline" disabled={portalBusy} onClick={openPortal}>
                {portalBusy ? "Opening…" : "Billing portal"}
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Still stuck?{" "}
            <a
              href="mailto:hello@marrow.so?subject=Subscription%20confirmation%20issue"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Contact support
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold">Setting up your subscription…</h1>
        <p className="text-muted-foreground text-sm">
          {slow
            ? "Almost there — confirming your payment with Stripe."
            : "One moment while we finish things up."}
        </p>
      </div>
    </div>
  );
}

export default function SubscribeSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}
