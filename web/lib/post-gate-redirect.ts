import { listWorkspaces } from "@/lib/api";

/** Where to send a user after onboarding/subscribe gates clear. */
export async function postGateRedirectPath(): Promise<string> {
  const workspaces = await listWorkspaces();
  if (workspaces.length === 1) {
    return `/w/${workspaces[0].id}`;
  }
  return "/home";
}
