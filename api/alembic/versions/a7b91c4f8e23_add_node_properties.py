"""add node properties and folder-defined schemas

Revision ID: a7b91c4f8e23
Revises: c58f38d0a5aa
Create Date: 2026-05-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a7b91c4f8e23"
down_revision: Union[str, Sequence[str], None] = "c58f38d0a5aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


VALUE_TYPES = ("text", "number", "date", "select", "multi_select", "checkbox")


def upgrade() -> None:
    # Folder-defined property schema entries.
    # Pages inherit property schemas from every ancestor folder.
    op.create_table(
        "node_property_schemas",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("node_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column("value_type", sa.Text(), nullable=False),
        sa.Column(
            "options",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("position", sa.Text(), nullable=False, server_default="a0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("node_id", "key", name="uq_property_schema_node_key"),
        sa.CheckConstraint(
            f"value_type IN {VALUE_TYPES!r}",
            name="node_property_schemas_value_type_valid",
        ),
    )
    op.create_index(
        "idx_node_property_schemas_node",
        "node_property_schemas",
        ["node_id"],
    )

    # Per-node property values. Primarily attached to pages, but also allowed
    # on folders so a folder schema can carry its own metadata if desired.
    op.create_table(
        "node_properties",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("node_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("value_type", sa.Text(), nullable=False),
        # Canonical storage: JSONB. text/number/date/checkbox store a scalar,
        # multi_select stores an array of strings, select stores a string.
        sa.Column(
            "value",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("node_id", "key", name="uq_node_property_node_key"),
        sa.CheckConstraint(
            f"value_type IN {VALUE_TYPES!r}",
            name="node_properties_value_type_valid",
        ),
    )
    op.create_index(
        "idx_node_properties_node",
        "node_properties",
        ["node_id"],
    )

    # ----- FTS integration -------------------------------------------------
    # Helper: stringify a node's property values into a single text blob for
    # tsvector indexing. Includes select/multi-select values and free text.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION node_properties_text(p_node_id uuid)
        RETURNS text LANGUAGE sql STABLE AS $$
            SELECT COALESCE(
                string_agg(
                    CASE
                        WHEN p.value_type IN ('text', 'select') AND
                             jsonb_typeof(p.value) = 'string'
                            THEN p.value #>> '{}'
                        WHEN p.value_type = 'multi_select' AND
                             jsonb_typeof(p.value) = 'array'
                            THEN (
                                SELECT string_agg(elem #>> '{}', ' ')
                                FROM jsonb_array_elements(p.value) AS elem
                            )
                        WHEN p.value_type = 'number' AND p.value IS NOT NULL
                            THEN p.value::text
                        WHEN p.value_type = 'date' AND p.value IS NOT NULL
                            THEN p.value #>> '{}'
                        ELSE ''
                    END,
                    ' '
                ),
                ''
            )
            FROM node_properties p
            WHERE p.node_id = p_node_id;
        $$;
        """
    )

    # Replace the revision-insert trigger function so it also folds property
    # values into the node's search_vector with weight C.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_node_search_vector()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE nodes
            SET search_vector =
                setweight(to_tsvector('english', COALESCE(nodes.name, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B') ||
                setweight(
                    to_tsvector('english', COALESCE(node_properties_text(NEW.node_id), '')),
                    'C'
                )
            WHERE id = NEW.node_id
              AND type = 'page';
            RETURN NEW;
        END;
        $$;
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_node_search_vector_on_name_change()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.type = 'page' THEN
                NEW.search_vector :=
                    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
                    setweight(to_tsvector('english', COALESCE(
                        (SELECT content FROM revisions WHERE id = NEW.current_revision_id),
                        ''
                    )), 'B') ||
                    setweight(
                        to_tsvector('english', COALESCE(node_properties_text(NEW.id), '')),
                        'C'
                    );
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )

    # Recompute the affected page's search_vector when any of its properties
    # are inserted, updated, or deleted.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_node_search_vector_for_props()
        RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            target_id uuid;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                target_id := OLD.node_id;
            ELSE
                target_id := NEW.node_id;
            END IF;

            UPDATE nodes n
            SET search_vector =
                setweight(to_tsvector('english', COALESCE(n.name, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(
                    (SELECT content FROM revisions WHERE id = n.current_revision_id),
                    ''
                )), 'B') ||
                setweight(
                    to_tsvector('english', COALESCE(node_properties_text(n.id), '')),
                    'C'
                )
            WHERE n.id = target_id
              AND n.type = 'page';

            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_node_properties_refresh_fts
        AFTER INSERT OR UPDATE OR DELETE ON node_properties
        FOR EACH ROW EXECUTE FUNCTION refresh_node_search_vector_for_props();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_node_properties_refresh_fts ON node_properties")
    op.execute("DROP FUNCTION IF EXISTS refresh_node_search_vector_for_props()")

    # Restore pre-properties FTS trigger functions.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_node_search_vector()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE nodes
            SET search_vector =
                setweight(to_tsvector('english', COALESCE(nodes.name, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B')
            WHERE id = NEW.node_id
              AND type = 'page';
            RETURN NEW;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_node_search_vector_on_name_change()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.type = 'page' THEN
                NEW.search_vector :=
                    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
                    setweight(to_tsvector('english', COALESCE(
                        (SELECT content FROM revisions WHERE id = NEW.current_revision_id),
                        ''
                    )), 'B');
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    op.execute("DROP FUNCTION IF EXISTS node_properties_text(uuid)")

    op.drop_index("idx_node_properties_node", table_name="node_properties")
    op.drop_table("node_properties")
    op.drop_index("idx_node_property_schemas_node", table_name="node_property_schemas")
    op.drop_table("node_property_schemas")
