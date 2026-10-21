"""Generate independent deployment credentials without printing or overwriting them."""

import argparse
import base64
import json
import os
import secrets
from pathlib import Path
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("infra/.env.server"))
    parser.add_argument("--origin", default="http://localhost:3000")
    args = parser.parse_args()
    parsed = urlparse(args.origin)
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.netloc
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
        or parsed.username
        or parsed.password
    ):
        parser.error("origin must be an http(s) origin without a path")
    database = secrets.token_hex(24)
    redis = secrets.token_hex(24)
    values = {
        "APP_ENV": "production",
        "CORS_ORIGINS": json.dumps([args.origin.rstrip("/")]),
        "POSTGRES_ADMIN_PASSWORD": secrets.token_hex(24),
        "DATABASE_PASSWORD": database,
        "DATABASE_URL": f"postgresql+asyncpg://vibe:{database}@127.0.0.1:25432/vibe_music",
        "REDIS_PASSWORD": redis,
        "REDIS_URL": f"redis://:{redis}@127.0.0.1:26379/0",
        "MINIO_ACCESS_KEY": "vibe_" + secrets.token_hex(8),
        "MINIO_SECRET_KEY": secrets.token_hex(32),
        "MINIO_ENDPOINT": "127.0.0.1:29000",
        "AUTH_SECRET": secrets.token_hex(32),
        "SMTP_HOST": "smtp.example.com",
        "SMTP_PORT": "587",
        "SMTP_FROM": "Vibe Music <noreply@example.com>",
        "SMTP_USERNAME": "",
        "SMTP_PASSWORD": "",
        "SMTP_START_TLS": "true",
        "SMTP_USE_TLS": "false",
        "AGENT_KEY_ENCRYPTION_KEY": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("# Private deployment configuration. Do not commit or print this file.\n")
        handle.writelines(f"{name}={value}\n" for name, value in values.items())
    print(f"Created {args.output}; configure SMTP privately. Users supply their own model keys.")


if __name__ == "__main__":
    main()
