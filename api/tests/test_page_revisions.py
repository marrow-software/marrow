"""Integration tests for persist_page_revision (#255)."""

import json
import os
import uuid

import pytest

from marrow.models import (
    Node,
    NodeLink,
    NodeWatch,
    Notification,
    Organization,
    OrgMembership,
    OrgRole,
    Revision,
    Space,
    User,
    Workspace,
)
from marrow.page_revisions import persist_page_revision

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://marrow:marrow@localhost:5433/marrow")


@pytest.fixture
def db():
    from marrow.dependencies import get_db

    session = next(get_db())
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _make_user(session, email: str) -> User:
    user = User(
        oidc_issuer="https://test.example.com",
        oidc_subject=uuid.uuid4().hex,
        email=email,
        name="Test User",
    )
    session.add(user)
    session.flush()
    return user


def _make_workspace(session) -> tuple:
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Test Org")
    session.add(org)
    session.flush()
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="Test WS")
    session.add(ws)
    session.flush()
    space = Space(workspace_id=ws.id, slug="main", name="Main")
    session.add(space)
    session.flush()
    return org, ws, space


def _add_membership(session, org, user, role: OrgRole) -> None:
    session.add(OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=role.value))
    session.flush()


def _make_empty_page(session, space, name: str = "Page") -> Node:
    """Page node with no revision yet (create-path shape)."""
    node = Node(
        space_id=space.id,
        parent_id=None,
        type="page",
        name=name,
        slug=f"{name.lower()}-{uuid.uuid4().hex[:6]}",
        position="a0",
    )
    session.add(node)
    session.flush()
    return node


def _make_page(session, space, name: str = "Page", content: str = "hello") -> Node:
    node = _make_empty_page(session, space, name=name)
    rev = Revision(node_id=node.id, content=content, content_format="markdown")
    session.add(rev)
    session.flush()
    node.current_revision_id = rev.id
    session.flush()
    return node


def _doc_with_mention(user_id: uuid.UUID) -> str:
    return json.dumps(
        [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "mention",
                        "props": {
                            "userId": str(user_id),
                            "displayName": "Someone",
                        },
                    }
                ],
            }
        ]
    )


class TestPersistPageRevision:
    def test_creates_revision_and_links(self, db):
        _, _, space = _make_workspace(db)
        target = _make_page(db, space, "Target")
        src = _make_empty_page(db, space, "Source")
        db.commit()

        rev = persist_page_revision(
            db,
            node=src,
            content=f"[t](/pages/{target.id})",
            content_format="markdown",
            actor_user_id=None,
        )
        db.commit()

        db.refresh(src)
        assert src.current_revision_id == rev.id
        assert rev.content == f"[t](/pages/{target.id})"
        targets = {
            row.target_node_id for row in db.query(NodeLink).filter_by(source_node_id=src.id)
        }
        assert targets == {target.id}

    def test_mention_delta_notifies_once(self, db):
        author = _make_user(db, "author-persist@test.com")
        target = _make_user(db, "target-persist@test.com")
        org, _, space = _make_workspace(db)
        _add_membership(db, org, author, OrgRole.EDITOR)
        page = _make_empty_page(db, space)
        db.commit()

        doc = _doc_with_mention(target.id)
        persist_page_revision(
            db,
            node=page,
            content=doc,
            content_format="json",
            actor_user_id=author.id,
        )
        db.commit()
        assert db.query(Notification).filter_by(user_id=target.id, kind="mention").count() == 1

        persist_page_revision(
            db,
            node=page,
            content=doc,
            content_format="json",
            actor_user_id=author.id,
        )
        db.commit()
        assert db.query(Notification).filter_by(user_id=target.id, kind="mention").count() == 1

    def test_actor_excluded_from_mentions_and_watches(self, db):
        actor = _make_user(db, "actor-persist@test.com")
        org, _, space = _make_workspace(db)
        _add_membership(db, org, actor, OrgRole.EDITOR)
        page = _make_empty_page(db, space)
        db.add(NodeWatch(user_id=actor.id, node_id=page.id))
        db.commit()

        persist_page_revision(
            db,
            node=page,
            content=_doc_with_mention(actor.id),
            content_format="json",
            actor_user_id=actor.id,
        )
        db.commit()

        assert db.query(Notification).filter_by(user_id=actor.id).count() == 0

    def test_watcher_notified_on_first_persist(self, db):
        """Create-path parity: first revision fans out watch events."""
        watcher = _make_user(db, "watcher-persist@test.com")
        editor = _make_user(db, "editor-persist@test.com")
        org, _, space = _make_workspace(db)
        _add_membership(db, org, watcher, OrgRole.VIEWER)
        _add_membership(db, org, editor, OrgRole.EDITOR)
        page = _make_empty_page(db, space)
        db.add(NodeWatch(user_id=watcher.id, node_id=page.id))
        db.commit()

        persist_page_revision(
            db,
            node=page,
            content="first save",
            content_format="markdown",
            actor_user_id=editor.id,
        )
        db.commit()

        notes = db.query(Notification).filter_by(user_id=watcher.id, kind="watch_event").all()
        assert len(notes) == 1
        assert notes[0].payload["event"] == "save"
        assert notes[0].payload["node_id"] == str(page.id)

    def test_watch_failure_does_not_block_revision(self, db, monkeypatch):
        watcher = _make_user(db, "watch-fail@test.com")
        org, _, space = _make_workspace(db)
        _add_membership(db, org, watcher, OrgRole.VIEWER)
        page = _make_empty_page(db, space)
        db.add(NodeWatch(user_id=watcher.id, node_id=page.id))
        db.commit()

        def _boom(*_args, **_kwargs):
            raise RuntimeError("fan-out broken")

        monkeypatch.setattr("marrow.page_revisions.fan_out_watch_event", _boom)

        rev = persist_page_revision(
            db,
            node=page,
            content="must persist",
            content_format="markdown",
            actor_user_id=None,
        )
        db.commit()

        db.refresh(page)
        assert page.current_revision_id == rev.id
        assert rev.content == "must persist"
        assert db.query(Notification).filter_by(user_id=watcher.id, kind="watch_event").count() == 0

    def test_rejects_folder_node(self, db):
        _, _, space = _make_workspace(db)
        folder = Node(
            space_id=space.id,
            parent_id=None,
            type="folder",
            name="Folder",
            slug=f"folder-{uuid.uuid4().hex[:6]}",
            position="a0",
        )
        db.add(folder)
        db.flush()

        with pytest.raises(ValueError, match="page node"):
            persist_page_revision(
                db,
                node=folder,
                content="nope",
                content_format="markdown",
                actor_user_id=None,
            )
