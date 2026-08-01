import { Sparkles } from "lucide-react";
import {
  getAuthStatus,
  getMyRecent,
  listNotifications,
  listOrgs,
  listStarred,
  listWorkspaces,
} from "@/lib/api";
import {
  InboxWidget,
  RecentWidget,
  StarredWidget,
  SwitcherWidget,
} from "@/components/home/widgets";

function firstName(name?: string | null): string | null {
  if (!name) return null;
  const n = name.trim().split(/\s+/)[0];
  return n || null;
}

// Global Home / For You — the post-login default, aggregating across every
// workspace and org the user can access. The subscription gate is enforced in
// app/home/layout.tsx.
export default async function GlobalHomePage() {
  const [auth, recent, starred, notifications, workspaces, orgs] = await Promise.all([
    getAuthStatus().catch(() => null),
    getMyRecent(12).catch(() => []),
    listStarred().catch(() => []),
    listNotifications().catch(() => ({ notifications: [], unread_count: 0 })),
    listWorkspaces().catch(() => []),
    listOrgs().catch(() => []),
  ]);

  const name = firstName(auth?.user?.name);
  const greeting = name ? `Welcome back, ${name}` : "Welcome back";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" />
          For you
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{greeting}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything across your workspaces, in one place.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <RecentWidget items={recent} />
          <InboxWidget
            notifications={notifications.notifications}
            unreadCount={notifications.unread_count}
          />
        </div>
        <div className="space-y-6">
          <SwitcherWidget workspaces={workspaces} orgs={orgs} />
          <StarredWidget items={starred} />
        </div>
      </div>
    </div>
  );
}
