"""Node properties — typed key-value metadata.

Two related resources:

* ``node_properties`` — per-node values (the data a user enters on a page).
* ``node_property_schemas`` — folder-defined schema entries that page nodes
  descended from that folder inherit. Pages can carry property values whose
  key is defined either by their own schema entry or by any ancestor folder.
"""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db
from ..models import Node, NodeProperty, NodePropertySchema, OrgRole
from ..rbac import require_node_role
from ..schemas import (
    InheritedPropertySchema,
    NodePropertiesView,
    NodePropertyRead,
    NodePropertySchemaCreate,
    NodePropertySchemaRead,
    NodePropertySchemaUpdate,
    NodePropertyWrite,
)

router = APIRouter(tags=["properties"])


def _node_or_404(node_id: UUID, db: Session) -> Node:
    node = db.get(Node, node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Node not found")
    return node


def _ancestor_ids(node: Node, db: Session) -> list[UUID]:
    """Return ancestor folder ids in root → leaf order, excluding *node* itself."""
    ids: list[UUID] = []
    current = node
    while current.parent_id is not None:
        parent = db.get(Node, current.parent_id)
        if parent is None or parent.deleted_at is not None:
            break
        ids.append(parent.id)
        current = parent
    ids.reverse()
    return ids


def _validate_value(value_type: str, value: Any) -> Any:
    """Coerce/validate a property value. Returns the normalized value."""
    if value is None:
        return None
    if value_type == "text":
        if not isinstance(value, str):
            raise HTTPException(400, "text property requires a string value")
        return value
    if value_type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise HTTPException(400, "number property requires a numeric value")
        return value
    if value_type == "date":
        if not isinstance(value, str):
            raise HTTPException(400, "date property requires an ISO date string")
        return value
    if value_type == "checkbox":
        if not isinstance(value, bool):
            raise HTTPException(400, "checkbox property requires a boolean value")
        return value
    if value_type == "select":
        if not isinstance(value, str):
            raise HTTPException(400, "select property requires a string value")
        return value
    if value_type == "multi_select":
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise HTTPException(400, "multi_select property requires a list of strings")
        return value
    raise HTTPException(400, f"Unsupported value_type: {value_type}")


# ---------------------------------------------------------------------------
# Per-node property values
# ---------------------------------------------------------------------------


@router.get("/api/nodes/{node_id}/properties", response_model=NodePropertiesView)
def list_node_properties(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    node = _node_or_404(node_id, db)
    props = (
        db.execute(
            select(NodeProperty).where(NodeProperty.node_id == node_id).order_by(NodeProperty.key)
        )
        .scalars()
        .all()
    )

    inherited: list[InheritedPropertySchema] = []
    seen_keys: set[str] = set()
    ancestor_ids = _ancestor_ids(node, db)
    for anc_id in ancestor_ids:
        rows = (
            db.execute(
                select(NodePropertySchema)
                .where(NodePropertySchema.node_id == anc_id)
                .order_by(NodePropertySchema.position, NodePropertySchema.key)
            )
            .scalars()
            .all()
        )
        for s in rows:
            if s.key in seen_keys:
                continue
            seen_keys.add(s.key)
            inherited.append(
                InheritedPropertySchema(
                    key=s.key,
                    label=s.label,
                    value_type=s.value_type,  # type: ignore[arg-type]
                    options=list(s.options or []),
                    required=s.required,
                    source_node_id=s.node_id,
                )
            )

    return NodePropertiesView(
        properties=[NodePropertyRead.model_validate(p) for p in props],
        inherited_schema=inherited,
    )


@router.put("/api/nodes/{node_id}/properties/{key}", response_model=NodePropertyRead)
def set_node_property(
    node_id: UUID,
    key: str,
    body: NodePropertyWrite,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    _node_or_404(node_id, db)
    normalized = _validate_value(body.value_type, body.value)

    existing = db.execute(
        select(NodeProperty).where(NodeProperty.node_id == node_id, NodeProperty.key == key)
    ).scalar_one_or_none()

    if existing is None:
        prop = NodeProperty(
            node_id=node_id,
            key=key,
            value_type=body.value_type,
            value=normalized,
        )
        db.add(prop)
    else:
        existing.value_type = body.value_type
        existing.value = normalized
        existing.updated_at = datetime.now(timezone.utc)
        prop = existing

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Property conflict")
    db.refresh(prop)
    return prop


@router.delete("/api/nodes/{node_id}/properties/{key}", status_code=204)
def delete_node_property(
    node_id: UUID,
    key: str,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    _node_or_404(node_id, db)
    prop = db.execute(
        select(NodeProperty).where(NodeProperty.node_id == node_id, NodeProperty.key == key)
    ).scalar_one_or_none()
    if prop is None:
        raise HTTPException(404, "Property not found")
    db.delete(prop)
    db.commit()


# ---------------------------------------------------------------------------
# Folder-defined property schemas
# ---------------------------------------------------------------------------


@router.get(
    "/api/nodes/{node_id}/property-schema",
    response_model=list[NodePropertySchemaRead],
)
def list_property_schemas(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    _node_or_404(node_id, db)
    return (
        db.execute(
            select(NodePropertySchema)
            .where(NodePropertySchema.node_id == node_id)
            .order_by(NodePropertySchema.position, NodePropertySchema.key)
        )
        .scalars()
        .all()
    )


@router.post(
    "/api/nodes/{node_id}/property-schema",
    response_model=NodePropertySchemaRead,
    status_code=201,
)
def create_property_schema(
    node_id: UUID,
    body: NodePropertySchemaCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    node = _node_or_404(node_id, db)
    if node.type != "folder":
        raise HTTPException(400, "Property schemas can only be defined on folder nodes")

    entry = NodePropertySchema(
        node_id=node_id,
        key=body.key,
        label=body.label,
        value_type=body.value_type,
        options=body.options,
        required=body.required,
        position=body.position or "a0",
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"Schema key '{body.key}' already exists on this folder")
    db.refresh(entry)
    return entry


@router.patch(
    "/api/nodes/{node_id}/property-schema/{key}",
    response_model=NodePropertySchemaRead,
)
def update_property_schema(
    node_id: UUID,
    key: str,
    body: NodePropertySchemaUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    _node_or_404(node_id, db)
    entry = db.execute(
        select(NodePropertySchema).where(
            NodePropertySchema.node_id == node_id, NodePropertySchema.key == key
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(404, "Schema entry not found")

    if body.label is not None:
        entry.label = body.label
    if body.value_type is not None:
        entry.value_type = body.value_type
    if body.options is not None:
        entry.options = body.options
    if body.required is not None:
        entry.required = body.required
    if body.position is not None:
        entry.position = body.position

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/api/nodes/{node_id}/property-schema/{key}", status_code=204)
def delete_property_schema(
    node_id: UUID,
    key: str,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    _node_or_404(node_id, db)
    entry = db.execute(
        select(NodePropertySchema).where(
            NodePropertySchema.node_id == node_id, NodePropertySchema.key == key
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(404, "Schema entry not found")
    db.delete(entry)
    db.commit()
