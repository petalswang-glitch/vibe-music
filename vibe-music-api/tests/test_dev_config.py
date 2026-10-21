from cryptography.fernet import Fernet

from app.configure_dev import configure


def test_local_configuration_preserves_database_and_never_rotates_existing_secrets(tmp_path):
    template = "DATABASE_URL=postgresql+asyncpg://local/example\n# AUTH_SECRET=\n"
    (tmp_path / ".env.example").write_text(template)
    assert set(configure(tmp_path)) == {"AUTH_SECRET", "AGENT_KEY_ENCRYPTION_KEY"}
    original = (tmp_path / ".env").read_text()
    assert "DATABASE_URL=postgresql+asyncpg://local/example" in original
    values = dict(
        line.split("=", 1)
        for line in original.splitlines()
        if not line.startswith("#") and "=" in line
    )
    Fernet(values["AGENT_KEY_ENCRYPTION_KEY"].encode())
    assert configure(tmp_path) == ()
    assert (tmp_path / ".env").read_text() == original
