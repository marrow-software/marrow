// TypeScript types mirroring the Marrow API Pydantic schemas.

export interface Organization {
  id: string;
  slug: string;
  name: string;
  created_at: string;
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
  // Present on GET /api/nodes/{id}
  content?: string | null;
  content_format?: "markdown" | "json" | null;
}

export interface Revision {
  id: string;
  node_id: string;
  content_format: "markdown" | "json";
  created_at: string;
  content?: string;
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

// Nested tree for sidebar rendering
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
  org_id?: string;
  slug: string;
  name: string;
  spaces: SpaceTreeItem[];
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
