// TypeScript types mirroring the Marrow API Pydantic schemas.

export interface Organization {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  members_can_create_spaces: boolean;
}

export interface OrgMembership {
  id: string;
  org_id: string;
  user_id: string | null;
  email: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
}

export interface Workspace {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  created_at: string;
}

export interface Space {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  created_at: string;
}

export type NodeType = "folder" | "page";

export interface Node {
  id: string;
  space_id: string;
  parent_id: string | null;
  type: NodeType;
  name: string;
  slug: string;
  position: string;
  description: string | null;
  current_revision_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  content?: string | null;
  content_format?: "markdown" | "json" | null;
}

// A node that links to the current page (backlinks drawer).
export interface Backlink {
  id: string;
  space_id: string;
  type: "folder" | "page";
  name: string;
  slug: string;
}

export interface StarredNode {
  id: string;
  space_id: string;
  parent_id: string | null;
  type: "folder" | "page";
  name: string;
  slug: string;
  starred_at: string;
}

export interface Revision {
  id: string;
  node_id: string;
  content: string;
  content_format: "markdown" | "json";
  created_at: string;
}

export interface Attachment {
  id: string;
  node_id: string;
  filename: string;
  hash: string;
  size_bytes: number;
  created_at: string;
}

// Search
export interface SearchResultItem {
  node_id: string;
  name: string;
  snippet: string;
  space_id: string;
  space_name: string;
  node_path: string[];
  rank: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
}

// Nested tree for sidebar rendering (recursive node hierarchy)
export interface NodeTreeItem {
  id: string;
  parent_id: string | null;
  type: NodeType;
  name: string;
  slug: string;
  position: string;
  description: string | null;
  children: NodeTreeItem[];
}

export interface SpaceTreeItem {
  id: string;
  slug: string;
  name: string;
  nodes: NodeTreeItem[];
}

export interface WorkspaceTree {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  spaces: SpaceTreeItem[];
}

// Node properties
export type PropertyValueType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi-select"
  | "checkbox";

export interface PropertySchema {
  id: string;
  node_id: string;
  key: string;
  value_type: PropertyValueType;
  options: string[] | null;
}

export interface EffectiveProperty {
  key: string;
  value_type: PropertyValueType;
  options: string[] | null;
  value: string | null;
  inherited: boolean;
  defined_on: string | null;
}

export interface EffectivePropertiesResponse {
  node_id: string;
  properties: EffectiveProperty[];
}

// Home / For You
export interface RecentNodeItem {
  node_id: string;
  name: string;
  space_id: string;
  space_name: string;
  node_path: string[]; // ancestor folder names, root -> leaf
  updated_at: string;
}

export interface WorkspaceHome {
  workspace_id: string;
  workspace_name: string;
  space_count: number;
  page_count: number;
  recent: RecentNodeItem[];
}

// Auth
export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthStatus {
  authenticated: boolean;
  user: User | null;
  method: string;
  oidc_enabled: boolean;
}

// View-only sharing links (#40)
export interface ShareLink {
  id: string;
  node_id: string;
  token: string;
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
}

// Comments (page-level discussion; #101)
export interface Comment {
  id: string;
  node_id: string;
  author_user_id: string | null;
  author_name: string | null;
  parent_comment_id: string | null;
  body: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchStatus {
  watching: boolean;
}

// Notifications (Inbox)
export type NotificationKind =
  | "mention"
  | "comment_reply"
  | "share_request"
  | "watch_event";

export interface Notification {
  id: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationList {
  notifications: Notification[];
  unread_count: number;
}
