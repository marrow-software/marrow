"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createCheckoutSession, listOrgs } from "@/lib/api";
import type { Organization } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Interval = "monthly" | "yearly";

// Display copy for the three self-serve Cloud tiers. Seat caps mirror
// `api/marrow/routers/billing.py` TIER_SEAT_LIMITS. Prices are display-only —
// Stripe Checkout is the source of truth and confirms the final amount.
const TIERS: {
  id: string;
  name: string;
  seats: string;
  price: Record<Interval, number>;
  features: string[];
  highlighted?: boolean;
}[] = [
  {
    id: "starter",
    name: "Starter",
    seats: "Up to 10 members",
    price: { monthly: 12, yearly: 10 },
    features: ["All core wiki features", "Export / restore guarantee", "Full-text search"],
  },
  {
    id: "business",
    name: "Business",
    seats: "Up to 50 members",
    price: { monthly: 49, yearly: 41 },
    features: ["Everything in Starter", "Priority email support", "Managed backups"],
    highlighted: true,
  },
  {
    id: "growth",
    name: "Growth",
    seats: "Up to 250 members",
    price: { monthly: 199, yearly: 166 },
    features: ["Everything in Business", "Higher rate limits", "Onboarding assistance"],
  },
];

function SubscribeInner() {
  const params = useSearchParams();
  const canceled = params.get("canceled") === "1";
  const orgParam = params.get("org");

  const [orgId, setOrgId] = useState<string | null>(orgParam);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>("monthly");
  const [pendingTier, setPendingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(!orgParam);

  // Resolve the org to subscribe when none is passed: first org the user can
  // pay for (no active subscription).
  useEffect(() => {
    let cancelled = false;
    if (orgParam) {
      listOrgs()
        .then((orgs) => {
          const match = orgs.find((o) => o.id === orgParam);
          if (!cancelled && match) setOrgName(match.name);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    listOrgs()
      .then((orgs: Organization[]) => {
        if (cancelled) return;
        const payable = orgs.find((o) => !o.has_active_subscription) ?? orgs[0] ?? null;
        if (payable) {
          setOrgId(payable.id);
          setOrgName(payable.name);
        }
        setResolving(false);
      })
      .catch(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgParam]);

  async function selectPlan(tier: string) {
    if (!orgId) {
      setError("No organization found to subscribe. Please reload and try again.");
      return;
    }
    setError(null);
    setPendingTier(tier);
    try {
      const { url } = await createCheckoutSession(orgId, tier, interval);
      window.location.assign(url);
    } catch (e: unknown) {
      setPendingTier(null);
      const msg = e instanceof Error ? e.message : "Failed to start checkout";
      setError(
        msg.includes("403")
          ? "Only an organization owner can choose a plan."
          : msg
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Choose your plan</h1>
        <p className="text-muted-foreground">
          {orgName ? (
            <>
              Subscribe <span className="font-medium text-foreground">{orgName}</span> to get
              started. Every plan includes a 14-day free trial.
            </>
          ) : (
            "Every plan includes a 14-day free trial."
          )}
        </p>
      </div>

      {canceled && (
        <p className="mt-6 rounded-lg border border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
          Checkout was canceled. Pick a plan whenever you&apos;re ready.
        </p>
      )}
      {error && (
        <p className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          className={cn(
            "rounded-full px-4 py-1.5 transition-colors",
            interval === "monthly"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval("yearly")}
          className={cn(
            "rounded-full px-4 py-1.5 transition-colors",
            interval === "yearly"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Yearly <span className="text-xs opacity-80">(save ~17%)</span>
        </button>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={cn(
              "flex flex-col rounded-2xl border p-6",
              tier.highlighted
                ? "border-primary shadow-sm ring-1 ring-primary/20"
                : "border-border"
            )}
          >
            <h2 className="text-lg font-semibold">{tier.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tier.seats}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-bold">${tier.price[interval]}</span>
              <span className="text-sm text-muted-foreground">
                /mo{interval === "yearly" ? ", billed yearly" : ""}
              </span>
            </div>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {tier.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-primary">
                    ✓
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              size="lg"
              variant={tier.highlighted ? "default" : "outline"}
              className="mt-6 w-full"
              disabled={resolving || pendingTier !== null}
              onClick={() => selectPlan(tier.id)}
            >
              {pendingTier === tier.id ? "Redirecting…" : "Start free trial"}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        Need more than 250 members or custom terms?{" "}
        <a
          href="mailto:hello@marrow.so?subject=Marrow%20Enterprise"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Contact sales
        </a>
      </div>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground text-sm">Loading plans…</p>
        </div>
      }
    >
      <SubscribeInner />
    </Suspense>
  );
}
