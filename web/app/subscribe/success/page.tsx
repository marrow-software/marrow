"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getOrg, listOrgs } from "@/lib/api";

// Stripe redirects back here before the webhook is guaranteed to have landed.
// Poll the org's subscription state, then forward into the app once active.
const MAX_ATTEMPTS = 15;
const POLL_MS = 1500;

function SuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  const orgId = params.get("org");
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function isActive(): Promise<boolean> {
      try {
        if (orgId) {
          const org = await getOrg(orgId);
          return org.has_active_subscription;
        }
        const orgs = await listOrgs();
        return orgs.some((o) => o.has_active_subscription);
      } catch {
        return false;
      }
    }

    async function poll() {
      if (cancelled) return;
      if (await isActive()) {
        router.replace("/home");
        return;
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        // Webhook is taking longer than expected — let the user proceed; the
        // workspace/home gate re-checks server-side.
        router.replace("/home");
        return;
      }
      if (attempts >= 3) setSlow(true);
      timer = setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orgId, router]);

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
