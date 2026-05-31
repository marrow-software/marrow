"""add node_properties table

Revision ID: 2187bd1a529d
Revises: c58f38d0a5aa
Create Date: 2026-05-16 14:10:05.736075

Adds typed key-value metadata to nodes (folder schemas + page values) and
folds property text into the page search_vector so properties are searchable
via FTS. A shared `marrow_node_search_vector(uuid)` function recomputes the
full vector (name → weight A, content → B, properties → C); all node search
triggers are rewritten to use it, plus a new trigger on `node_properties`.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2187bd1a529d"
down_revision: Union[str, Sequence[str], None] = "c58f38d0a5aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "node_properties",
        sa.Column(
            "id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("node_id", sa.UUID(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("value_type", sa.Text(), nullable=False),
        sa.Column("options", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "value_type IN ('text', 'number', 'date', 'select', 'multi-select', 'checkbox')",
            name="node_properties_value_type_valid",
        ),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("node_id", "key", name="uq_node_properties_node_key"),
    )
    op.create_index(
        "idx_node_properties_node", "node_properties", ["node_id"], unique=False
    )

    # Shared helper: full search_vector for a page node (name A, content B,
    # property keys+values C). Used by every node search trigger so that none
    # of them clobber another signal's contribution.
    op.execute("""
        CREATE OR REPLACE FUNCTION marrow_node_search_vector(p_node_id uuid)
        RETURNS tsvector LANGUAGE sql STABLE AS $$
            SELECT
                setweight(to_tsvector('english', COALESCE(
                    (SELECT name FROM nodes WHERE id = p_node_id), '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(
                    (SELECT r.content FROM revisions r
                     JOIN nodes n ON n.current_revision_id = r.id
                     WHERE n.id = p_node_id), '')), 'B') ||
                setweight(to_tsvector('english', COALESCE(
                    (SELECT string_agg(key || ' ' || COALESCE(value, ''), ' ')
                     FROM node_properties WHERE node_id = p_node_id), '')), 'C')
        $$;
    """)

    # Rewrite revision-insert trigger. The trigger fires AFTER INSERT on
    # revisions, before nodes.current_revision_id is repointed, so the body
    # text must come from NEW.content directly (not a current_revision lookup).
    # Property text is folded in as weight C.
    op.execute("""
        CREATE OR REPLACE FUNCTION update_node_search_vector()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE nodes
            SET search_vector =
                setweight(to_tsvector('english', COALESCE(nodes.name, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B') ||
                setweight(to_tsvector('english', COALESCE(
                    (SELECT string_agg(key || ' ' || COALESCE(value, ''), ' ')
                     FROM node_properties WHERE node_id = NEW.node_id), '')), 'C')
            WHERE id = NEW.node_id AND type = 'page';
            RETURN NEW;
        END;
        $$;
    """)

    # Rewrite name/slug-change trigger. Recompute from NEW values directly so
    # the not-yet-committed name is reflected; properties folded in as weight C.
    op.execute("""
        CREATE OR REPLACE FUNCTION update_node_search_vector_on_name_change()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.type = 'page' THEN
                NEW.search_vector :=
                    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
                    setweight(to_tsvector('english', COALESCE(
                        (SELECT content FROM revisions WHERE id = NEW.current_revision_id),
                        '')), 'B') ||
                    setweight(to_tsvector('english', COALESCE(
                        (SELECT string_agg(key || ' ' || COALESCE(value, ''), ' ')
                         FROM node_properties WHERE node_id = NEW.id), '')), 'C');
            END IF;
            RETURN NEW;
        END;
        $$;
    """)

    # New: refresh the owning page's search_vector when its properties change.
    op.execute("""
        CREATE OR REPLACE FUNCTION update_node_search_vector_on_property_change()
        RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            target uuid := COALESCE(NEW.node_id, OLD.node_id);
        BEGIN
            UPDATE nodes
            SET search_vector = marrow_node_search_vector(target)
            WHERE id = target AND type = 'page';
            RETURN NULL;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER trg_property_update_node_search_vector
        AFTER INSERT OR UPDATE OR DELETE ON node_properties
        FOR EACH ROW EXECUTE FUNCTION update_node_search_vector_on_property_change();
    """)


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_property_update_node_search_vector ON node_properties"
    )
    op.execute("DROP FUNCTION IF EXISTS update_node_search_vector_on_property_change()")
    op.drop_index("idx_node_properties_node", table_name="node_properties")
    op.drop_table("node_properties")

    # Restore the pre-properties trigger function bodies (no node_properties ref).
    op.execute("""
        CREATE OR REPLACE FUNCTION update_node_search_vector()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE nodes
            SET search_vector =
                setweight(to_tsvector('english', COALESCE(nodes.name, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B')
            WHERE id = NEW.node_id AND type = 'page';
            RETURN NEW;
        END;
        $$;
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION update_node_search_vector_on_name_change()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.type = 'page' THEN
                NEW.search_vector :=
                    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
                    setweight(to_tsvector('english', COALESCE(
                        (SELECT content FROM revisions WHERE id = NEW.current_revision_id),
                        '')), 'B');
            END IF;
            RETURN NEW;
        END;
        $$;
    """)
    op.execute("DROP FUNCTION IF EXISTS marrow_node_search_vector(uuid)")
