"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding, getAuthStatus, listOrgs } from "@/lib/api";
import { postGateRedirectPath } from "@/lib/post-gate-redirect";
import type { Organization } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * First-run onboarding: name the auto-created org (solo-first copy in the UI).
 * Shown when AuthStatus.needs_onboarding is true (the user owns an org with
 * onboarded_at unset). Gate order is onboarding → subscription → home.
 */
function namePlaceholder(userName: string | undefined): string {
  const first = userName?.trim().split(/\s+/)[0];
  return first || "My knowledge";
}

export default function OnboardingPage() {
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [placeholder, setPlaceholder] = useState("My knowledge");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getAuthStatus();
        if (cancelled) return;
        setPlaceholder(namePlaceholder(status.user?.name));
        if (!status.authenticated) {
          router.replace("/login");
          return;
        }
        if (!status.needs_onboarding) {
          const path = status.has_payable_unsubscribed_org
            ? "/subscribe"
            : await postGateRedirectPath();
          router.replace(path);
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
        // Leave name empty so the personalized placeholder is visible; submit falls back to it.
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
    const finalName = name.trim() || placeholder;
    if (!org || !finalName) return;
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding(org.id, finalName);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Couldn't save your name. Try again.");
      return;
    }
    try {
      const status = await getAuthStatus();
      const path = status.has_payable_unsubscribed_org
        ? "/subscribe"
        : await postGateRedirectPath();
      router.replace(path);
    } catch {
      setBusy(false);
      setError("Saved, but we couldn't continue. Try refreshing the page.");
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
          <h1 className="text-2xl font-bold tracking-tight">What should we call your Marrow?</h1>
          <p className="text-muted-foreground text-sm">
            This is your private home for notes and docs. You can invite others later.
          </p>
        </div>
        <div className="space-y-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            disabled={busy}
            aria-label="Knowledge base name"
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}
