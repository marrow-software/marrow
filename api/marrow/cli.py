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


@app.command("reset-org-billing")
def reset_org_billing(
    slug: str = typer.Argument(..., help="Organization slug to reset"),
    database_url: str | None = typer.Option(
        None, "--database-url", envvar="DATABASE_URL", help="PostgreSQL connection URL"
    ),
) -> None:
    """Reset an org's billing + onboarding state for repeatable auth/payment testing.

    Clears subscription_status / tier / billing_interval / Stripe IDs /
    onboarded_at back to fresh-signup values. Never touches Stripe — delete
    the Stripe test customer separately before re-testing.
    """
    load_dotenv()

    from sqlalchemy import select

    from .db import get_session
    from .models import Organization

    with get_session(database_url) as session:
        org = session.execute(
            select(Organization).where(Organization.slug == slug)
        ).scalar_one_or_none()
        if org is None:
            typer.echo(f"Error: organization '{slug}' not found", err=True)
            raise typer.Exit(1)
        org.subscription_status = "none"
        org.tier = "starter"
        org.billing_interval = None
        org.stripe_subscription_id = None
        org.stripe_customer_id = None
        org.onboarded_at = None
        session.commit()
    typer.echo(f"Reset billing + onboarding state for org '{slug}'")


if __name__ == "__main__":
    app()
