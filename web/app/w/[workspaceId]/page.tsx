import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock, FileText, FolderPlus, Sparkles } from "lucide-react";
import { getAuthStatus, getWorkspaceHome } from "@/lib/api";
import { relativeTime } from "@/lib/utils";

interface Props {
  params: Promise<{ workspaceId: string }>;
}

function firstName(name?: string | null): string | null {
  if (!name) return null;
  const n = name.trim().split(/\s+/)[0];
  return n || null;
}

export default async function WorkspaceHomePage({ params }: Props) {
  const { workspaceId } = await params;

  let home;
  try {
    home = await getWorkspaceHome(workspaceId);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("401")) {
      redirect("/login");
    }
    throw e;
  }

  const auth = await getAuthStatus().catch(() => null);
  const name = firstName(auth?.user?.name);
  const greeting = name ? `Welcome back, ${name}` : "Welcome back";

  const isEmpty = home.space_count === 0;
  const pageWord = home.page_count === 1 ? "page" : "pages";
  const spaceWord = home.space_count === 1 ? "space" : "spaces";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 py-12">
        <header className="mb-10">
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            For you
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEmpty
              ? `${home.workspace_name} is ready - create your first space to start writing.`
              : `${home.page_count} ${pageWord} across ${home.space_count} ${spaceWord} in ${home.workspace_name}.`}
          </p>
        </header>

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
            <FolderPlus className="h-10 w-10 text-muted-foreground/50" />
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold">No spaces yet</h2>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Spaces hold your folders and pages. Use the{" "}
                <span className="font-medium text-foreground">Pages</span> panel in
                the sidebar to create your first space.
              </p>
            </div>
          </div>
        ) : (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recently edited
            </h2>
            {home.recent.length === 0 ? (
              <p className="rounded-lg border border-border px-4 py-6 text-center text-sm text-muted-foreground">
                No pages yet. Create one from the sidebar to see it here.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {home.recent.map((item) => {
                  const crumb = [item.space_name, ...item.node_path].join(" / ");
                  return (
                    <li key={item.node_id}>
                      <Link
                        href={`/w/${workspaceId}/n/${item.node_id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {item.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {crumb}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {relativeTime(item.updated_at)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
