"""Pydantic request/response schemas for the Marrow REST API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class _ReadBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Workspace
# ---------------------------------------------------------------------------


class WorkspaceCreate(BaseModel):
    slug: str
    name: str
    org_id: UUID | None = None


class WorkspaceRead(_ReadBase):
    id: UUID
    org_id: UUID
    slug: str
    name: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Space
# ---------------------------------------------------------------------------


class SpaceCreate(BaseModel):
    slug: str
    name: str


class SpaceRead(_ReadBase):
    id: UUID
    workspace_id: UUID
    slug: str
    name: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------


class NodeCreate(BaseModel):
    type: Literal["folder", "page"]
    name: str
    slug: str | None = None
    parent_id: UUID | None = None
    position: str | None = None
    description: str | None = None
    content: str | None = None
    content_format: Literal["markdown", "json"] = "markdown"


class NodeRead(_ReadBase):
    id: UUID
    space_id: UUID
    parent_id: UUID | None
    type: Literal["folder", "page"]
    name: str
    slug: str
    position: str
    description: str | None
    current_revision_id: UUID | None
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class NodeReadWithContent(NodeRead):
    content: str | None = None
    content_format: Literal["markdown", "json"] | None = None


class StarredNodeRead(_ReadBase):
    """A starred node, surfaced in the Starred rail panel."""

    id: UUID
    space_id: UUID
    parent_id: UUID | None
    type: Literal["folder", "page"]
    name: str
    slug: str
    starred_at: datetime


class NodeUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    content: str | None = None
    content_format: Literal["markdown", "json"] | None = None
    position: str | None = None
    parent_id: UUID | None = None


class NodeTreeItem(_ReadBase):
    id: UUID
    parent_id: UUID | None
    type: Literal["folder", "page"]
    name: str
    slug: str
    position: str
    description: str | None
    children: list["NodeTreeItem"] = []


NodeTreeItem.model_rebuild()


# ---------------------------------------------------------------------------
# Comment
# ---------------------------------------------------------------------------


class CommentCreate(BaseModel):
    body: str
    parent_comment_id: UUID | None = None


class CommentUpdate(BaseModel):
    """All fields optional — used for editing the body and/or resolve toggle."""

    body: str | None = None
    resolved: bool | None = None


class CommentRead(_ReadBase):
    id: UUID
    node_id: UUID
    author_user_id: UUID | None
    author_name: str | None = None
    parent_comment_id: UUID | None
    body: str
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SpaceTreeItem(_ReadBase):
    id: UUID
    slug: str
    name: str
    nodes: list[NodeTreeItem] = []


class WorkspaceTree(_ReadBase):
    id: UUID
    org_id: UUID
    slug: str
    name: str
    spaces: list[SpaceTreeItem] = []


# ---------------------------------------------------------------------------
# Revision
# ---------------------------------------------------------------------------


class RevisionRead(_ReadBase):
    id: UUID
    node_id: UUID
    content: str
    content_format: Literal["markdown", "json"]
    created_at: datetime


# ---------------------------------------------------------------------------
# Attachment
# ---------------------------------------------------------------------------


class AttachmentRead(_ReadBase):
    id: UUID
    node_id: UUID
    filename: str
    hash: str
    size_bytes: int
    created_at: datetime


# ---------------------------------------------------------------------------
# Node properties
# ---------------------------------------------------------------------------

PropertyValueType = Literal["text", "number", "date", "select", "multi-select", "checkbox"]


class PropertySchemaUpsert(BaseModel):
    """Define or update a property in a folder's schema."""

    value_type: PropertyValueType
    options: list[str] | None = None


class PropertySchemaRead(_ReadBase):
    id: UUID
    node_id: UUID
    key: str
    value_type: PropertyValueType
    options: list[str] | None = None


class PropertyValueUpsert(BaseModel):
    """Set a property value on a page node."""

    value: str | None = None
    value_type: PropertyValueType


class EffectiveProperty(BaseModel):
    """A property as seen on a page: its type/options (possibly inherited from
    an ancestor folder schema) plus the page's own value when set."""

    key: str
    value_type: PropertyValueType
    options: list[str] | None = None
    value: str | None = None
    inherited: bool = False
    defined_on: UUID | None = None


class EffectivePropertiesResponse(BaseModel):
    node_id: UUID
    properties: list[EffectiveProperty]


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


class SearchResultItem(BaseModel):
    node_id: UUID
    name: str
    snippet: str
    space_id: UUID
    space_name: str
    node_path: list[str]
    rank: float


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResultItem]


# ---------------------------------------------------------------------------
# Share links
# ---------------------------------------------------------------------------


class ShareLinkCreate(BaseModel):
    expires_at: datetime | None = None


class ShareLinkRead(_ReadBase):
    id: UUID
    node_id: UUID
    token: str
    created_by: UUID | None
    expires_at: datetime | None
    created_at: datetime


class SharedNode(BaseModel):
    """A node rendered for a public viewer (no account required).

    For pages, ``content`` / ``content_format`` carry the current revision.
    For folders, ``children`` carries the visible (non-trashed) subtree.
    """

    id: UUID
    type: Literal["folder", "page"]
    name: str
    slug: str
    description: str | None = None
    content: str | None = None
    content_format: Literal["markdown", "json"] | None = None
    children: list["SharedNode"] = []


SharedNode.model_rebuild()


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------


class OrganizationCreate(BaseModel):
    slug: str
    name: str


class OrganizationRead(_ReadBase):
    id: UUID
    slug: str
    name: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Org Membership
# ---------------------------------------------------------------------------


class OrgMembershipCreate(BaseModel):
    email: str
    role: str


class OrgMembershipRead(_ReadBase):
    id: UUID
    org_id: UUID
    user_id: UUID | None
    email: str
    role: str
    created_at: datetime


class OrgMembershipUpdate(BaseModel):
    role: str


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class UserRead(_ReadBase):
    id: UUID
    email: str
    name: str


class AuthStatus(BaseModel):
    authenticated: bool
    user: UserRead | None = None
    method: str
    oidc_enabled: bool


class WatchStatus(BaseModel):
    """Whether the current user is watching a given node."""

    watching: bool


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


class NotificationRead(_ReadBase):
    id: UUID
    kind: Literal["mention", "comment_reply", "share_request", "watch_event"]
    payload: dict
    read_at: datetime | None
    created_at: datetime


class NotificationList(BaseModel):
    notifications: list[NotificationRead]
    unread_count: int
