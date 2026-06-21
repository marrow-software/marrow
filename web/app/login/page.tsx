import { redirect } from "next/navigation";
import { getApiUrl, getOidcEnabled } from "@/lib/runtime-config";
import { Button } from "@/components/ui/button";

// Never statically prerender: this page branches on runtime env
// (getOidcEnabled / getApiUrl, read from process.env per request on Workers)
// and reads searchParams. A static prerender bakes in build-time env and then
// 500s on Workers when it reads searchParams at request time.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ signedout?: string }>;
}) {
  if (!getOidcEnabled()) {
    redirect("/workspaces");
  }

  const apiUrl = getApiUrl();
  const { signedout } = await searchParams;

  if (signedout) {
    return (
      <Button render={<a href={`${apiUrl}/api/auth/login`} />}>
        You have been signed out. Click here to sign in again.
      </Button>
    );
  }

  redirect(`${apiUrl}/api/auth/login`);
}
