import { redirect } from "next/navigation";
import { listWorkspaces } from "@/lib/api";

// Route signed-in users directly to their workspace (skip workspace picker).
// Falls back to /workspaces when there are zero or multiple workspaces.
export default async function Home() {
  try {
    const workspaces = await listWorkspaces();
    if (workspaces.length === 1) {
      redirect(`/w/${workspaces[0].id}`);
    }
  } catch {
    // Unauthenticated or API unavailable — fall through to /workspaces, which
    // self-gates: a 401 there triggers the OIDC login redirect in lib/api.ts.
  }
  redirect("/workspaces");
}
