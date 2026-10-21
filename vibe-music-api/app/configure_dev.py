"""Create missing local secrets without printing them or replacing existing configuration."""

import os
import secrets
from pathlib import Path

from cryptography.fernet import Fernet


def configure(root: Path):
    target = root / ".env"
    content = (
        target.read_text("utf-8") if target.exists() else (root / ".env.example").read_text("utf-8")
    )
    present = {
        name.strip()
        for line in content.splitlines()
        if not line.lstrip().startswith("#") and "=" in line
        for name, value in [line.split("=", 1)]
        if value.strip()
    }
    missing = {}
    if "AUTH_SECRET" not in present:
        missing["AUTH_SECRET"] = secrets.token_urlsafe(48)
    if "AGENT_KEY_ENCRYPTION_KEY" not in present:
        missing["AGENT_KEY_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
    if missing or not target.exists():
        content = content.rstrip() + "\n"
        content += "".join(f"{name}={value}\n" for name, value in missing.items())
        target.write_text(content, encoding="utf-8")
        os.chmod(target, 0o600)
    return tuple(missing)


if __name__ == "__main__":
    configure(Path(__file__).resolve().parents[1])
    print("Local configuration is ready; existing values preserved and no secrets printed.")
