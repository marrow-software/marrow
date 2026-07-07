import { listWorkspaces } from "@/lib/api";

/** Where to send a user after onboarding/subscribe gates clear. Never throws. */
export async function postGateRedirectPath(): Promise<string> {
  try {
    const workspaces = await listWorkspaces();
    if (workspaces.length === 1) {
      return `/w/${workspaces[0].id}`;
    }
  } catch {
    // Fall through to /home on any API error.
  }
  return "/home";
}
