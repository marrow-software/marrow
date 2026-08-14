"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getOrg,
  listOrgMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  updateOrg,
} from "@/lib/api";
import type { Organization, OrgMembership } from "@/lib/types";

const ROLES = ["owner", "editor", "viewer"] as const;

export default function OrgSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  // Origin workspace (#317) — forwarded to the admin dashboard so its
  // "Back to [workspace]" row can return to the space tree.
  const fromWorkspace = useSearchParams().get("ws");
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("editor");
  const [busy, setBusy] = useState(false);
  const [savingPermission, setSavingPermission] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([getOrg(orgId), listOrgMembers(orgId)]);
      setOrg(o);
      setMembers(m);
    } catch (err) {
      toast.error(String(err));
    }
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [o, m] = await Promise.all([getOrg(orgId), listOrgMembers(orgId)]);
        if (cancelled) return;
        setOrg(o);
        setNameDraft(o.name);
        setMembers(m);
      } catch (err) {
        if (!cancelled) toast.error(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      await inviteMember(orgId, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      await load();
      toast.success("Member invited");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(membershipId: string, newRole: string) {
    try {
      await updateMemberRole(orgId, membershipId, newRole);
      await load();
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleRemove(membershipId: string) {
    try {
      await removeMember(orgId, membershipId);
      await load();
    } catch (err) {
      toast.error(String(err));
    }
  }

  if (!org) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-8 space-y-8">
      <div className="space-y-3">
        <Link
          href="/workspaces"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Workspaces
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{org.name}</h1>
            <p className="text-sm text-muted-foreground">Organization settings</p>
          </div>
          <Link
            href={fromWorkspace ? `/orgs/${orgId}/admin?ws=${fromWorkspace}` : `/orgs/${orgId}/admin`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Admin dashboard
          </Link>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">General</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const name = nameDraft.trim();
            if (!name || name === org.name) return;
            setSavingName(true);
            try {
              const updated = await updateOrg(orgId, { name });
              setOrg(updated);
              setNameDraft(updated.name);
              toast.success("Organization renamed");
            } catch (err) {
              toast.error(String(err));
            } finally {
              setSavingName(false);
            }
          }}
          className="space-y-2"
        >
          <label htmlFor="org-name" className="text-sm font-medium">
            Organization name
          </label>
          <div className="flex gap-2">
            <Input
              id="org-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              disabled={savingName}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={savingName || !nameDraft.trim() || nameDraft.trim() === org.name}
            >
              {savingName ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Members</h2>
        <div className="divide-y rounded-md border">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {m.email}
                  {m.user_id === null && (
                    <span className="ml-2 text-xs text-amber-600">(pending)</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  className="text-sm border rounded px-2 py-1 bg-background"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleRemove(m.id)}
                  className="text-destructive hover:text-destructive"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">No members</p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Permissions</h2>
        <div className="flex items-center justify-between rounded-md border px-4 py-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Allow members to create spaces</p>
            <p className="text-xs text-muted-foreground">
              When off, only owners can create spaces in this org&apos;s workspaces.
            </p>
          </div>
          <input
            type="checkbox"
            disabled={savingPermission}
            checked={org.members_can_create_spaces}
            onChange={async (e) => {
              setSavingPermission(true);
              try {
                const updated = await updateOrg(orgId, {
                  members_can_create_spaces: e.target.checked,
                });
                setOrg(updated);
                toast.success("Setting saved");
              } catch (err) {
                toast.error(String(err));
              } finally {
                setSavingPermission(false);
              }
            }}
            className="h-4 w-4 cursor-pointer accent-primary"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Invite member</h2>
        <form onSubmit={handleInvite} className="flex gap-2">
          <Input
            type="email"
            placeholder="Email address"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            disabled={busy}
            className="flex-1"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={busy || !inviteEmail.trim()}>
            Invite
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          If the user hasn&apos;t signed up yet, the invite will be pending until they log in.
        </p>
      </section>
    </div>
  );
}
