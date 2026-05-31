"""Node property endpoints — typed key-value metadata and folder schemas.

A *folder* node may declare a property schema (key + value_type + options).
Every *page* node descended from that folder inherits the schema and may set
its own value for each key. Effective properties for a page are resolved by
walking the ancestor folder chain (nearest ancestor wins) and overlaying the
page's own stored values.
"""

import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db
from ..models import Node, NodeProperty, OrgRole
from ..rbac import require_node_role
from ..schemas import (
    EffectivePropertiesResponse,
    EffectiveProperty,
    PropertySchemaRead,
    PropertySchemaUpsert,
    PropertyValueUpsert,
)

router = APIRouter(tags=["properties"])


def _node_or_404(node_id: UUID, db: Session) -> Node:
    node = db.get(Node, node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Node not found")
    return node


def _decode_options(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return decoded if isinstance(decoded, list) else None


def _ancestor_chain(node: Node, db: Session) -> list[Node]:
    """Return ancestors nearest-first (parent, grandparent, ...)."""
    chain: list[Node] = []
    seen: set[UUID] = set()
    current = node.parent_id
    while current is not None and current not in seen:
        seen.add(current)
        parent = db.get(Node, current)
        if parent is None or parent.deleted_at is not None:
            break
        chain.append(parent)
        current = parent.parent_id
    return chain


def _to_schema_read(prop: NodeProperty) -> PropertySchemaRead:
    return PropertySchemaRead(
        id=prop.id,
        node_id=prop.node_id,
        key=prop.key,
        value_type=prop.value_type,  # type: ignore[arg-type]
        options=_decode_options(prop.options),
    )


# ---------------------------------------------------------------------------
# Folder schema definitions
# ---------------------------------------------------------------------------


@router.get(
    "/api/nodes/{node_id}/property-schema",
    response_model=list[PropertySchemaRead],
)
def list_property_schema(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    node = _node_or_404(node_id, db)
    if node.type != "folder":
        raise HTTPException(400, "Property schemas are defined on folder nodes")
    rows = (
        db.execute(
            select(NodeProperty).where(NodeProperty.node_id == node_id).order_by(NodeProperty.key)
        )
        .scalars()
        .all()
    )
    return [_to_schema_read(r) for r in rows]


@router.put(
    "/api/nodes/{node_id}/property-schema/{key}",
    response_model=PropertySchemaRead,
)
def upsert_property_schema(
    node_id: UUID,
    key: str,
    body: PropertySchemaUpsert,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    node = _node_or_404(node_id, db)
    if node.type != "folder":
        raise HTTPException(400, "Property schemas are defined on folder nodes")
    if body.value_type in ("select", "multi-select") and not body.options:
        raise HTTPException(400, f"value_type '{body.value_type}' requires options")

    options_json = json.dumps(body.options) if body.options is not None else None
    prop = (
        db.execute(
            select(NodeProperty).where(NodeProperty.node_id == node_id, NodeProperty.key == key)
        )
        .scalars()
        .first()
    )
    if prop is None:
        prop = NodeProperty(
            node_id=node_id,
            key=key,
            value_type=body.value_type,
            options=options_json,
        )
        db.add(prop)
    else:
        prop.value_type = body.value_type
        prop.options = options_json
        prop.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(prop)
    return _to_schema_read(prop)


@router.delete("/api/nodes/{node_id}/property-schema/{key}", status_code=204)
def delete_property_schema(
    node_id: UUID,
    key: str,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    node = _node_or_404(node_id, db)
    if node.type != "folder":
        raise HTTPException(400, "Property schemas are defined on folder nodes")
    prop = (
        db.execute(
            select(NodeProperty).where(NodeProperty.node_id == node_id, NodeProperty.key == key)
        )
        .scalars()
        .first()
    )
    if prop is None:
        raise HTTPException(404, "Property schema not found")
    db.delete(prop)
    db.commit()


# ---------------------------------------------------------------------------
# Page property values (with inherited schema resolution)
# ---------------------------------------------------------------------------


@router.get(
    "/api/nodes/{node_id}/properties",
    response_model=EffectivePropertiesResponse,
)
def get_effective_properties(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    node = _node_or_404(node_id, db)

    # Inherited schema: nearest ancestor folder wins for a given key.
    schema: dict[str, EffectiveProperty] = {}
    for ancestor in reversed(_ancestor_chain(node, db)):
        if ancestor.type != "folder":
            continue
        for prop in ancestor.properties:
            schema[prop.key] = EffectiveProperty(
                key=prop.key,
                value_type=prop.value_type,  # type: ignore[arg-type]
                options=_decode_options(prop.options),
                value=None,
                inherited=True,
                defined_on=ancestor.id,
            )

    # Overlay the node's own stored values.
    for prop in node.properties:
        existing = schema.get(prop.key)
        if existing is not None:
            existing.value = prop.value
        else:
            schema[prop.key] = EffectiveProperty(
                key=prop.key,
                value_type=prop.value_type,  # type: ignore[arg-type]
                options=_decode_options(prop.options),
                value=prop.value,
                inherited=False,
                defined_on=node.id,
            )

    return EffectivePropertiesResponse(
        node_id=node.id,
        properties=sorted(schema.values(), key=lambda p: p.key),
    )


@router.put(
    "/api/nodes/{node_id}/properties/{key}",
    response_model=EffectiveProperty,
)
def set_property_value(
    node_id: UUID,
    key: str,
    body: PropertyValueUpsert,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    node = _node_or_404(node_id, db)
    if node.type != "page":
        raise HTTPException(400, "Property values are set on page nodes")

    prop = (
        db.execute(
            select(NodeProperty).where(NodeProperty.node_id == node_id, NodeProperty.key == key)
        )
        .scalars()
        .first()
    )
    if prop is None:
        prop = NodeProperty(
            node_id=node_id,
            key=key,
            value=body.value,
            value_type=body.value_type,
        )
        db.add(prop)
    else:
        prop.value = body.value
        prop.value_type = body.value_type
        prop.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(prop)
    return EffectiveProperty(
        key=prop.key,
        value_type=prop.value_type,  # type: ignore[arg-type]
        options=_decode_options(prop.options),
        value=prop.value,
        inherited=False,
        defined_on=node.id,
    )


@router.delete("/api/nodes/{node_id}/properties/{key}", status_code=204)
def delete_property_value(
    node_id: UUID,
    key: str,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    _node_or_404(node_id, db)
    prop = (
        db.execute(
            select(NodeProperty).where(NodeProperty.node_id == node_id, NodeProperty.key == key)
        )
        .scalars()
        .first()
    )
    if prop is None:
        raise HTTPException(404, "Property not found")
    db.delete(prop)
    db.commit()
