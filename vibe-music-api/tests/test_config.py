from app.core.config import Settings


def test_empty_compose_smtp_credentials_disable_auth_without_altering_real_passwords():
    blank = Settings(smtp_username="", smtp_password="")
    assert blank.smtp_username is None and blank.smtp_password is None
    authenticated = Settings(smtp_username="mailer", smtp_password=" leading and trailing ")
    assert authenticated.smtp_username == "mailer"
    assert authenticated.smtp_password.get_secret_value() == " leading and trailing "
