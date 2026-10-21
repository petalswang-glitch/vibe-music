import hashlib
import hmac
import re

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from starlette.concurrency import run_in_threadpool

hasher = PasswordHasher()


def _verify(password: str, stored: str) -> tuple[bool, bool]:
    if re.fullmatch(r"[0-9a-fA-F]{32}", stored):
        digest = hashlib.md5(password.encode("utf-8"), usedforsecurity=False).hexdigest()
        return hmac.compare_digest(digest, stored.lower()), True
    try:
        return hasher.verify(stored, password), hasher.check_needs_rehash(stored)
    except (VerificationError, InvalidHashError):
        return False, False


async def verify_password(password: str, stored: str) -> tuple[bool, bool]:
    return await run_in_threadpool(_verify, password, stored)


async def hash_password(password: str) -> str:
    return await run_in_threadpool(hasher.hash, password)


def credential_version(stored: str) -> str:
    return hashlib.sha256(stored.encode()).hexdigest()


class BusinessError(Exception):
    pass
