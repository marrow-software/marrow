import { redirect } from "next/navigation";
import { listWorkspaces } from "@/lib/api";

// Root: land signed-in users directly in their workspace. Falls back to
// /workspaces (create/select screen) when no workspace exists yet.
export default async function Home() {
  try {
    const workspaces = await listWorkspaces();
    if (workspaces.length > 0) {
      redirect(`/w/${workspaces[0].id}`);
    }
  } catch {
    // Not authenticated or API error — fall through to /workspaces which
    // handles both the unauthenticated and empty-workspace states.
  }
  redirect("/workspaces");
}
