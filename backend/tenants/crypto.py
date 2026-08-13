"""Reversible encryption for Tenant.db_password (see tenants/models/tenant.py).

Unlike a login password, this value can't be one-way hashed — the app must
recover the real plaintext every time it opens a connection to that tenant's
MySQL account (see db_registry._connection_config and
provisioning.create_tenant_database). Fernet (symmetric, authenticated
encryption) keeps it unreadable to anyone who only has database access —
recovering it also requires FIELD_ENCRYPTION_KEY, which lives in .env, never
in the database itself.
"""

from cryptography.fernet import Fernet
from django.conf import settings


def _fernet():
    if not settings.FIELD_ENCRYPTION_KEY:
        raise RuntimeError('FIELD_ENCRYPTION_KEY is not set — see .env.example.')
    return Fernet(settings.FIELD_ENCRYPTION_KEY.encode())


def encrypt_db_password(plaintext):
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_db_password(ciphertext):
    return _fernet().decrypt(ciphertext.encode()).decode()
