import { redirect } from "next/navigation";

// Root redirects to the global Home / For You. The /home layout enforces the
// auth + subscription gate, so unauthenticated users are sent to /login and
// unsubscribed owners (SaaS) to /subscribe from there.
export default function Home() {
  redirect("/home");
}
