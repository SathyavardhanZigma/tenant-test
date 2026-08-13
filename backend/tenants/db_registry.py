"""Injects tenant DB connections into settings.DATABASES / django.db.connections
at runtime, since Django doesn't support editing DATABASES via migrations.
"""

from django.conf import settings
from django.db import connections

from .crypto import decrypt_db_password


def _connection_config(tenant):
    # Includes every key Django's ConnectionHandler.configure_settings() would
    # otherwise fill in for entries declared up front in settings.DATABASES —
    # required here since this alias is injected after startup.
    return {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': tenant.db_name,
        'HOST': tenant.db_host,
        'PORT': tenant.db_port,
        'USER': tenant.db_user,
        'PASSWORD': decrypt_db_password(tenant.db_password),
        'OPTIONS': {
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
        },
        'ATOMIC_REQUESTS': False,
        'AUTOCOMMIT': True,
        'CONN_MAX_AGE': 0,
        'CONN_HEALTH_CHECKS': False,
        'TIME_ZONE': None,
        'TEST': {'CHARSET': None, 'COLLATION': None, 'MIGRATE': True, 'MIRROR': None, 'NAME': None},
    }


def register_tenant_database(tenant):
    """Add/update a single tenant's DB alias in the live connection registry.
    Call this right after provisioning a new tenant, and once per tenant on
    process startup (see load_all_tenant_databases)."""
    settings.DATABASES[tenant.slug] = _connection_config(tenant)
    connections.databases[tenant.slug] = _connection_config(tenant)


def load_all_tenant_databases():
    """Load every active tenant's DB connection into settings.DATABASES.
    Called from TenantsConfig.ready() on app startup."""
    from .models import Tenant

    try:
        for tenant in Tenant.objects.filter(status=Tenant.STATUS_ACTIVE):
            register_tenant_database(tenant)
    except Exception:
        # Central DB/tables may not exist yet (e.g. during initial `migrate`).
        pass
