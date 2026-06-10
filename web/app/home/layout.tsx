import { redirect } from "next/navigation";
import { GlobalChrome } from "@/components/global-chrome";
import {
  getAuthStatus,
  listNotifications,
  listOrgs,
  listWorkspaces,
} from "@/lib/api";

/**
 * Global Home shell. Uses its own lightweight chrome (NOT WorkspaceShell, which
 * is workspace-bound). Re-asserts the subscription gate as defense in depth:
 * the post-login callback already routes unsubscribed owners to /subscribe, but
 * a direct hit on /home must enforce the same rule.
 */
export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthStatus().catch(() => null);

  if (!auth?.authenticated) {
    redirect("/login");
  }
  if (auth.has_payable_unsubscribed_org) {
    redirect("/subscribe");
  }

  const [workspaces, orgs, notifications] = await Promise.all([
    listWorkspaces().catch(() => []),
    listOrgs().catch(() => []),
    listNotifications().catch(() => ({ notifications: [], unread_count: 0 })),
  ]);

  return (
    <div className="min-h-screen">
      <GlobalChrome
        user={auth.user}
        workspaces={workspaces}
        orgs={orgs}
        unreadCount={notifications.unread_count}
      />
      <main>{children}</main>
    </div>
  );
}
