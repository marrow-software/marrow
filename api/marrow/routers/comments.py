"""Page-level comment CRUD endpoints.

Comments attach to page nodes. Replies are modeled via self-referential
``parent_comment_id`` and resolved comments are flagged by a non-null
``resolved_at`` timestamp.

RBAC:
    * viewer — list / read
    * editor — post / reply / resolve / unresolve / edit-own
    * owner or comment author — delete
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db
from ..models import Comment, Node, OrgMembership, OrgRole, Space, Workspace
from ..rbac import (
    ROLE_HIERARCHY,
    require_comment_role,
    require_node_role,
)
from ..schemas import CommentCreate, CommentRead, CommentUpdate, UnreadCountResponse

router = APIRouter(tags=["comments"])


def _user_is_owner(db: Session, org_id: UUID, user_id: UUID | None) -> bool:
    if user_id is None:
        return False
    role = db.execute(
        select(OrgMembership.role).where(
            OrgMembership.org_id == org_id,
            OrgMembership.user_id == user_id,
        )
    ).scalar_one_or_none()
    return role is not None and ROLE_HIERARCHY[OrgRole(role)] >= ROLE_HIERARCHY[OrgRole.OWNER]


@router.post("/api/nodes/{node_id}/comments", response_model=CommentRead, status_code=201)
def create_comment(
    node_id: UUID,
    body: CommentCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    node = db.get(Node, node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Node not found")
    if node.type != "page":
        raise HTTPException(400, "Comments can only be attached to page nodes")
    if auth.user_id is None:
        raise HTTPException(401, "Authentication required to post comments")

    if body.parent_comment_id is not None:
        parent = db.get(Comment, body.parent_comment_id)
        if parent is None or parent.node_id != node_id:
            raise HTTPException(400, "Parent comment not found on this node")

    comment = Comment(
        node_id=node_id,
        author_user_id=auth.user_id,
        parent_comment_id=body.parent_comment_id,
        body=body.body,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.get("/api/nodes/{node_id}/comments", response_model=list[CommentRead])
def list_comments(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    node = db.get(Node, node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Node not found")
    return (
        db.execute(
            select(Comment)
            .where(Comment.node_id == node_id)
            .order_by(Comment.created_at)
        )
        .scalars()
        .all()
    )


@router.get("/api/nodes/{node_id}/comments/unread", response_model=UnreadCountResponse)
def unread_count(
    node_id: UUID,
    since: datetime | None = None,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    """Return the count of comments created after ``since``.

    Used by the floating bubble badge in the comments drawer (#92). The
    "last visit" timestamp is tracked client-side and passed via ``since``.
    When ``since`` is omitted the unread count is the total comment count.
    """
    node = db.get(Node, node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Node not found")

    stmt = select(func.count()).select_from(Comment).where(Comment.node_id == node_id)
    if since is not None:
        stmt = stmt.where(Comment.created_at > since)
    count = db.execute(stmt).scalar_one()
    return UnreadCountResponse(unread=int(count))


@router.patch("/api/comments/{comment_id}", response_model=CommentRead)
def update_comment(
    comment_id: UUID,
    body: CommentUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_comment_role(OrgRole.EDITOR)),
):
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(404, "Comment not found")

    # Editing the body is restricted to the original author.
    if body.body is not None:
        if auth.user_id is not None and comment.author_user_id != auth.user_id:
            raise HTTPException(403, "Only the author may edit a comment's body")
        comment.body = body.body

    if body.resolved is not None:
        comment.resolved_at = datetime.now(timezone.utc) if body.resolved else None

    comment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/api/comments/{comment_id}", status_code=204)
def delete_comment(
    comment_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_comment_role(OrgRole.VIEWER)),
):
    """Delete a comment. Author may delete their own; owners may delete any."""
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(404, "Comment not found")

    # api_key / anonymous bypass the role check entirely.
    if auth.user_id is not None and comment.author_user_id != auth.user_id:
        node = db.get(Node, comment.node_id)
        space = db.get(Space, node.space_id)
        workspace = db.get(Workspace, space.workspace_id)
        if not _user_is_owner(db, workspace.org_id, auth.user_id):
            raise HTTPException(403, "Only the author or an owner may delete this comment")

    db.delete(comment)
    db.commit()
