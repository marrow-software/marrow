import { HomeView } from "@/components/home-view";
import { getAuthStatus } from "@/lib/api";

export default async function WorkspaceHomePage() {
  const auth = await getAuthStatus().catch(() => null);
  return <HomeView user={auth?.user ?? null} />;
}
