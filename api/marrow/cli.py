"""Marrow CLI entry point."""

from pathlib import Path

import typer
from dotenv import load_dotenv

app = typer.Typer(help="Marrow — self-hosted knowledge base tools.")


@app.command()
def export(
    workspace: str = typer.Option(..., "--workspace", "-w", help="Workspace slug to export"),
    output: Path | None = typer.Option(
        None, "--output", "-o", help="Output path (file or directory; defaults to cwd)"
    ),
    slim: bool = typer.Option(
        False, "--slim", help="Skip revision history; export current content only"
    ),
    include_trash: bool = typer.Option(
        False, "--include-trash", help="Include soft-deleted (trashed) nodes in the export"
    ),
    database_url: str | None = typer.Option(
        None, "--database-url", envvar="DATABASE_URL", help="PostgreSQL connection URL"
    ),
    storage_path: str | None = typer.Option(
        None, "--storage-path", envvar="STORAGE_PATH", help="Path to attachment storage directory"
    ),
) -> None:
    """Export a workspace to a portable zip bundle."""
    load_dotenv()

    import os

    from .db import get_session
    from .export import export_workspace
    from .storage import LocalFilesystemAdapter

    storage_root = storage_path or os.getenv("STORAGE_PATH", "/var/lib/marrow/attachments")
    storage = LocalFilesystemAdapter(storage_root)

    try:
        with get_session(database_url) as session:
            result = export_workspace(
                slug=workspace,
                session=session,
                storage=storage,
                output_path=output,
                slim=slim,
                include_trash=include_trash,
            )
        typer.echo(f"Exported to {result}")
    except ValueError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(1)
    except (RuntimeError, FileNotFoundError) as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(1)


@app.command()
def restore(
    bundle: Path = typer.Argument(..., help="Path to the export bundle zip file"),
    database_url: str | None = typer.Option(
        None, "--database-url", envvar="DATABASE_URL", help="PostgreSQL connection URL"
    ),
    storage_path: str | None = typer.Option(
        None, "--storage-path", envvar="STORAGE_PATH", help="Path to attachment storage directory"
    ),
) -> None:
    """Restore a workspace from an export bundle."""
    load_dotenv()

    import os

    from .db import get_session
    from .restore import restore_workspace
    from .storage import LocalFilesystemAdapter

    storage_root = storage_path or os.getenv("STORAGE_PATH", "/var/lib/marrow/attachments")
    storage = LocalFilesystemAdapter(storage_root)

    try:
        with get_session(database_url) as session:
            slug = restore_workspace(bundle, session, storage)
            session.commit()
        typer.echo(f"Restored workspace '{slug}'")
    except ValueError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(1)
    except (RuntimeError, FileNotFoundError) as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(1)


@app.command("purge-trash")
def purge_trash(
    older_than_days: int = typer.Option(
        30, "--older-than-days", help="Purge trashed nodes older than N days"
    ),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="Report what would be deleted without changing anything"
    ),
    database_url: str | None = typer.Option(
        None, "--database-url", envvar="DATABASE_URL", help="PostgreSQL connection URL"
    ),
) -> None:
    """Hard-delete trashed nodes older than the threshold.

    Safe to run repeatedly — only nodes with ``deleted_at < NOW() - INTERVAL``
    are affected. Children are removed via the existing ON DELETE CASCADE FKs,
    so only top-level trashed ancestors need to be deleted explicitly.
    """
    load_dotenv()

    from sqlalchemy import delete, text

    from .db import get_session
    from .models import Node

    with get_session(database_url) as session:
        # Only delete top-level trashed nodes (parent is NULL or live); children
        # cascade via FK. Otherwise we'd attempt to delete already-cascaded rows.
        rows = session.execute(
            text("""
                SELECT n.id FROM nodes n
                LEFT JOIN nodes p ON p.id = n.parent_id
                WHERE n.deleted_at IS NOT NULL
                  AND n.deleted_at < NOW() - make_interval(days => :days)
                  AND (n.parent_id IS NULL OR p.deleted_at IS NULL)
            """),
            {"days": older_than_days},
        ).fetchall()
        ids = [r[0] for r in rows]

        if dry_run:
            typer.echo(f"Would purge {len(ids)} top-level trashed node(s).")
            return

        if not ids:
            typer.echo("No trashed nodes to purge.")
            return

        session.execute(delete(Node).where(Node.id.in_(ids)))
        session.commit()
        typer.echo(f"Purged {len(ids)} trashed node(s) (cascaded to descendants).")


if __name__ == "__main__":
    app()
