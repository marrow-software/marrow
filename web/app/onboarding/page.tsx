"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding, getAuthStatus, listOrgs } from "@/lib/api";
import type { Organization } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * First-run onboarding: name the auto-created organization. Shown when
 * AuthStatus.needs_onboarding is true (the user owns an org with
 * onboarded_at unset). Gate order is onboarding → subscription → home.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getAuthStatus();
        if (cancelled) return;
        if (!status.authenticated) {
          router.replace("/login");
          return;
        }
        if (!status.needs_onboarding) {
          router.replace(status.has_payable_unsubscribed_org ? "/subscribe" : "/home");
          return;
        }
        const orgs = await listOrgs();
        if (cancelled) return;
        const pending = orgs.find((o) => o.onboarded_at === null) ?? orgs[0] ?? null;
        if (!pending) {
          router.replace("/home");
          return;
        }
        setOrg(pending);
        setName(pending.name);
        setLoading(false);
      } catch {
        if (!cancelled) router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding(org.id, name.trim());
      const status = await getAuthStatus();
      router.replace(status.has_payable_unsubscribed_org ? "/subscribe" : "/home");
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Failed to save organization name");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Name your organization</h1>
          <p className="text-muted-foreground text-sm">
            This is how your team&apos;s workspace will appear in Marrow. You can change it
            anytime in organization settings.
          </p>
        </div>
        <div className="space-y-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
            disabled={busy}
            aria-label="Organization name"
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}
