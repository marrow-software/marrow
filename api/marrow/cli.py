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
    days: int = typer.Option(
        30, "--days", help="Hard-delete nodes whose deleted_at is older than this many days"
    ),
    database_url: str | None = typer.Option(
        None, "--database-url", envvar="DATABASE_URL", help="PostgreSQL connection URL"
    ),
) -> None:
    """Permanently delete trashed nodes older than the threshold (default 30 days).

    Safe to run repeatedly. Cron recipe (daily at 03:00):

        0 3 * * * /usr/local/bin/marrow purge-trash >> /var/log/marrow-purge.log 2>&1
    """
    load_dotenv()

    from sqlalchemy import text

    from .db import get_session

    with get_session(database_url) as session:
        result = session.execute(
            text(
                "DELETE FROM nodes WHERE deleted_at IS NOT NULL "
                "AND deleted_at < NOW() - make_interval(days => :days)"
            ),
            {"days": days},
        )
        session.commit()
        typer.echo(f"Purged {result.rowcount} trashed node(s) older than {days} days")


if __name__ == "__main__":
    app()
