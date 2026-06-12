"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuthStatus } from "@/lib/api";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    getAuthStatus()
      .then((status) => {
        if (!status.authenticated) {
          router.replace("/login");
          return;
        }
        // Gate order: onboarding → subscription → home. A first-run owner names
        // their org before anything else; an owner of an unsubscribed org (SaaS
        // only) is sent to checkout. Otherwise the global Home. Never the picker.
        if (status.needs_onboarding) {
          router.replace("/onboarding");
        } else if (status.has_payable_unsubscribed_org) {
          router.replace("/subscribe");
        } else {
          router.replace("/home");
        }
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground text-sm">Signing in...</p>
    </div>
  );
}
