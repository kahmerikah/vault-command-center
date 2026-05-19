from datetime import datetime
from hashlib import sha256
import base64
import os
from cryptography.fernet import Fernet
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def hash_api_key(raw_key: str) -> str:
    return sha256(raw_key.encode("utf-8")).hexdigest()


def utc_now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _fernet() -> Fernet:
    """Build a stable Fernet key from SECRET_KEY for app-level encryption."""
    secret = os.getenv("SECRET_KEY", "change-me").encode("utf-8")
    key = base64.urlsafe_b64encode(sha256(secret).digest())
    return Fernet(key)


def encrypt_value(raw_value: str) -> str:
    if raw_value is None:
        return ""
    return _fernet().encrypt(str(raw_value).encode("utf-8")).decode("utf-8")


def decrypt_value(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
