"""One-shot deployment task: apply schema migrations and create an empty private bucket."""

from pathlib import Path

from alembic.config import Config
from minio import Minio

from alembic import command
from app.core.config import get_settings


def main():
    root = Path(__file__).resolve().parents[1]
    migration = Config(str(root / "alembic.ini"))
    migration.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(migration, "head")
    settings = get_settings()
    store = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
        region=settings.minio_region,
    )
    if not store.bucket_exists(settings.minio_bucket):
        store.make_bucket(settings.minio_bucket, location=settings.minio_region)
    print("Schema and private storage bucket are ready; no business data was imported.")


if __name__ == "__main__":
    main()
