/**
 * Marrow API client.
 *
 * All requests go through `apiFetch`, which attaches the API key header
 * and throws a descriptive error on non-2xx responses.
 */

import { getApiKey, getApiUrl, getInternalApiUrl } from "./runtime-config";
import type {
  Attachment,
  AuthStatus,
  Backlink,
  Comment,
  EffectiveProperty,
  EffectivePropertiesResponse,
  Node,
  NodeType,
  Notification,
  NotificationList,
  Organization,
  OrgMembership,
  PropertySchema,
  PropertyValueType,
  Revision,
  SearchResponse,
  ShareLink,
  Space,
  StarredNode,
  WatchStatus,
  Workspace,
  WorkspaceTree,
} from "./types";

// Resolve URLs per-call so runtime config changes (e.g. operator updates env
// then restarts the container) take effect without rebuilding.
function baseUrl(): string {
  return typeof window === "undefined" ? getInternalApiUrl() : getApiUrl();
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
    ...(options.headers as Record<string, string>),
  };

  // Server-side: forward the session cookie from the incoming request
  if (typeof window === "undefined") {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const session = cookieStore.get("marrow_session");
    if (session) {
      headers["Cookie"] = `marrow_session=${session.value}`;
    }
  }

  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers,
    credentials: "include", // send cookies for cross-origin OIDC auth
    cache: "no-store", // always fetch fresh data — this is a wiki, not a CDN
  });

  if (!res.ok) {
    // Client-side 401: redirect to OIDC login
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = `${baseUrl()}/api/auth/login`;
      return new Promise(() => {}); // page is navigating away
    }
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export function listWorkspaces(): Promise<Workspace[]> {
  return apiFetch("/api/workspaces");
}

/** @deprecated Use createWorkspaceInOrg instead. */
export function createWorkspace(slug: string, name: string): Promise<Workspace> {
  return apiFetch("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ slug, name }),
  });
}

export function createWorkspaceInOrg(orgId: string, slug: string, name: string): Promise<Workspace> {
  return apiFetch(`/api/orgs/${orgId}/workspaces`, {
    method: "POST",
    body: JSON.stringify({ slug, name }),
  });
}

export function getWorkspace(id: string): Promise<Workspace> {
  return apiFetch(`/api/workspaces/${id}`);
}

export function getWorkspaceTree(id: string): Promise<WorkspaceTree> {
  return apiFetch(`/api/workspaces/${id}/tree`);
}

export function getExportSizeEstimate(
  workspaceId: string
): Promise<{ full_bytes: number; slim_bytes: number }> {
  return apiFetch(`/api/workspaces/${workspaceId}/export/estimate`);
}

export function exportWorkspaceUrl(workspaceId: string, slim: boolean): string {
  const params = slim ? "?slim=true" : "";
  return `${getApiUrl()}/api/workspaces/${workspaceId}/export${params}`;
}

export async function restoreWorkspace(file: File): Promise<Workspace> {
  const form = new FormData();
  form.append("bundle", file);

  const apiKey = getApiKey();
  const headers: Record<string, string> = apiKey ? { "X-API-Key": apiKey } : {};

  const res = await fetch(`${baseUrl()}/api/workspaces/restore`, {
    method: "POST",
    body: form,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let detail = text;
    try {
      detail = JSON.parse(text).detail ?? text;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function searchWorkspace(workspaceId: string, query: string): Promise<SearchResponse> {
  return apiFetch(`/api/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`);
}

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

export function createSpace(workspaceId: string, slug: string, name: string): Promise<Space> {
  return apiFetch(`/api/workspaces/${workspaceId}/spaces`, {
    method: "POST",
    body: JSON.stringify({ slug, name }),
  });
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export function createNode(
  spaceId: string,
  body: {
    type: NodeType;
    name: string;
    slug?: string;
    parent_id?: string | null;
    description?: string | null;
    content?: string;
    content_format?: "markdown" | "json";
    position?: string;
  }
): Promise<Node> {
  return apiFetch(`/api/spaces/${spaceId}/nodes`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getNode(nodeId: string): Promise<Node> {
  return apiFetch(`/api/nodes/${nodeId}`);
}

export function updateNode(
  nodeId: string,
  patch: {
    name?: string;
    slug?: string;
    description?: string | null;
    content?: string;
    content_format?: "markdown" | "json";
    position?: string;
    parent_id?: string | null;
  }
): Promise<Node> {
  return apiFetch(`/api/nodes/${nodeId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteNode(nodeId: string): Promise<void> {
  return apiFetch(`/api/nodes/${nodeId}`, { method: "DELETE" });
}

export function moveNode(
  nodeId: string,
  newParentId: string | null,
  position: string
): Promise<Node> {
  return updateNode(nodeId, { parent_id: newParentId, position });
}

export function listNodeChildren(nodeId: string): Promise<Node[]> {
  return apiFetch(`/api/nodes/${nodeId}/children`);
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

export function listRevisions(nodeId: string): Promise<Revision[]> {
  return apiFetch(`/api/nodes/${nodeId}/revisions`);
}

export function getRevision(nodeId: string, revisionId: string): Promise<Revision> {
  return apiFetch(`/api/nodes/${nodeId}/revisions/${revisionId}`);
}

// ---------------------------------------------------------------------------
// Backlinks
// ---------------------------------------------------------------------------

export function getBacklinks(nodeId: string): Promise<Backlink[]> {
  return apiFetch(`/api/nodes/${nodeId}/backlinks`);
}

// ---------------------------------------------------------------------------
// Starred nodes
// ---------------------------------------------------------------------------

export function listStarred(): Promise<StarredNode[]> {
  return apiFetch("/api/users/me/starred");
}

export function starNode(nodeId: string): Promise<void> {
  return apiFetch(`/api/nodes/${nodeId}/star`, { method: "POST" });
}

export function unstarNode(nodeId: string): Promise<void> {
  return apiFetch(`/api/nodes/${nodeId}/star`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export function listAttachments(nodeId: string): Promise<Attachment[]> {
  return apiFetch(`/api/nodes/${nodeId}/attachments`);
}

export async function uploadAttachment(nodeId: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);

  const apiKey = getApiKey();
  const headers: Record<string, string> = apiKey ? { "X-API-Key": apiKey } : {};

  const res = await fetch(`${baseUrl()}/api/nodes/${nodeId}/attachments`, {
    method: "POST",
    body: form,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Upload error ${res.status}: ${text}`);
  }
  return res.json();
}

export function attachmentFileUrl(nodeId: string, attachmentId: string): string {
  return `${baseUrl()}/api/nodes/${nodeId}/attachments/${attachmentId}/file`;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function getAuthStatus(): Promise<AuthStatus> {
  return apiFetch("/api/auth/me");
}

export async function logout(): Promise<string | null> {
  const data = await apiFetch<{ status: string; logout_url?: string }>("/api/auth/logout", {
    method: "POST",
  });
  return data.logout_url ?? null;
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export function listOrgs(): Promise<Organization[]> {
  return apiFetch("/api/orgs");
}

export function createOrg(slug: string, name: string): Promise<Organization> {
  return apiFetch("/api/orgs", {
    method: "POST",
    body: JSON.stringify({ slug, name }),
  });
}

export function getOrg(orgId: string): Promise<Organization> {
  return apiFetch(`/api/orgs/${orgId}`);
}

export function updateOrg(
  orgId: string,
  patch: { members_can_create_spaces?: boolean }
): Promise<Organization> {
  return apiFetch(`/api/orgs/${orgId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function listOrgMembers(orgId: string): Promise<OrgMembership[]> {
  return apiFetch(`/api/orgs/${orgId}/members`);
}

export function inviteMember(
  orgId: string,
  email: string,
  role: string
): Promise<OrgMembership> {
  return apiFetch(`/api/orgs/${orgId}/members`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export function updateMemberRole(
  orgId: string,
  membershipId: string,
  role: string
): Promise<OrgMembership> {
  return apiFetch(`/api/orgs/${orgId}/members/${membershipId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function removeMember(orgId: string, membershipId: string): Promise<void> {
  return apiFetch(`/api/orgs/${orgId}/members/${membershipId}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// View-only sharing links (#40)
// ---------------------------------------------------------------------------

export function createShareLink(
  nodeId: string,
  expiresAt: string | null
): Promise<ShareLink> {
  return apiFetch(`/api/nodes/${nodeId}/share-links`, {
    method: "POST",
    body: JSON.stringify({ expires_at: expiresAt }),
  });
}

export function listShareLinks(nodeId: string): Promise<ShareLink[]> {
  return apiFetch(`/api/nodes/${nodeId}/share-links`);
}

export function revokeShareLink(linkId: string): Promise<void> {
  return apiFetch(`/api/share-links/${linkId}`, { method: "DELETE" });
}

/** Public, no-account URL a viewer opens to read shared content. */
export function sharedLinkUrl(token: string): string {
  return `${getApiUrl()}/shared/${token}`;
}

// Node watches (#104) — subscribe to change notifications for a page or folder.

export function getWatchStatus(nodeId: string): Promise<WatchStatus> {
  return apiFetch(`/api/nodes/${nodeId}/watching`);
}

export function watchNode(nodeId: string): Promise<WatchStatus> {
  return apiFetch(`/api/nodes/${nodeId}/watch`, { method: "POST" });
}

export function unwatchNode(nodeId: string): Promise<void> {
  return apiFetch(`/api/nodes/${nodeId}/watch`, { method: "DELETE" });
}

// --- Notifications (Inbox) ---

export function listNotifications(): Promise<NotificationList> {
  return apiFetch("/api/users/me/notifications");
}

export function markNotificationRead(id: string): Promise<Notification> {
  return apiFetch(`/api/notifications/${id}`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/api/users/me/notifications/read-all", { method: "POST" });

// ---------------------------------------------------------------------------
// Node properties
// ---------------------------------------------------------------------------
// Node properties
// ---------------------------------------------------------------------------

/** Effective properties for a node (inherited folder schemas + own values). */
export function getNodeProperties(
  nodeId: string
): Promise<EffectivePropertiesResponse> {
  return apiFetch(`/api/nodes/${nodeId}/properties`);
}

/** Set (or clear) a property value on a page node. */
export function setNodeProperty(
  nodeId: string,
  key: string,
  value: string | null,
  valueType: PropertyValueType
): Promise<EffectiveProperty> {
  return apiFetch(`/api/nodes/${nodeId}/properties/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value, value_type: valueType }),
  });
}

export function deleteNodeProperty(nodeId: string, key: string): Promise<void> {
  return apiFetch(`/api/nodes/${nodeId}/properties/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
}

/** List a folder's property schema definitions. */
export function getPropertySchema(nodeId: string): Promise<PropertySchema[]> {
  return apiFetch(`/api/nodes/${nodeId}/property-schema`);
}

/** Define or update a property in a folder's schema. */
export function upsertPropertySchema(
  nodeId: string,
  key: string,
  valueType: PropertyValueType,
  options: string[] | null
): Promise<PropertySchema> {
  return apiFetch(
    `/api/nodes/${nodeId}/property-schema/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      body: JSON.stringify({ value_type: valueType, options }),
    }
  );
}

export function deletePropertySchema(
  nodeId: string,
  key: string
): Promise<void> {
  return apiFetch(
    `/api/nodes/${nodeId}/property-schema/${encodeURIComponent(key)}`,
    { method: "DELETE" }
  );
}

/** Convert a display name to a URL-safe slug. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Comments (#101)
// ---------------------------------------------------------------------------

export function listComments(nodeId: string): Promise<Comment[]> {
  return apiFetch(`/api/nodes/${nodeId}/comments`);
}

export function createComment(
  nodeId: string,
  body: string,
  parentCommentId?: string
): Promise<Comment> {
  return apiFetch(`/api/nodes/${nodeId}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body,
      parent_comment_id: parentCommentId ?? null,
    }),
  });
}

export function updateComment(
  commentId: string,
  patch: { body?: string; resolved?: boolean }
): Promise<Comment> {
  return apiFetch(`/api/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteComment(commentId: string): Promise<void> {
  return apiFetch(`/api/comments/${commentId}`, { method: "DELETE" });
}
