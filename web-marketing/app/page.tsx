import { SiteNav, SiteFooter } from "@/components/chrome";
import { Landing } from "@/components/landing/landing";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        <Landing />
      </main>
      <SiteFooter />
    </>
  );
}
