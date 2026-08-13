"""Dynamic tenant onboarding: create the tenant's database, register its
connection, run its migrations, and sync its Employee/Customer field schema."""

import re
import secrets
from contextlib import contextmanager

from django.conf import settings
from django.core.management import call_command
from django.db import connection as default_connection
from django.db import connections

from .crypto import decrypt_db_password, encrypt_db_password
from .db_registry import register_tenant_database
from .entities import ENTITY_TO_MODULE_KEY, MODULE_CHOICES
from .models import Tenant, TenantModule
from .schema_sync import drop_entity_table, sync_tenant_schema

# Both db_name and db_user end up interpolated directly into raw SQL below
# (MySQL can't bind identifiers as query parameters the way it binds values),
# so every identifier is checked against this whitelist right before use —
# defense-in-depth on top of Tenant.slug already being a validated SlugField.
_SAFE_IDENTIFIER_RE = re.compile(r'^[A-Za-z0-9_-]+$')


def _assert_safe_identifier(value):
    if not _SAFE_IDENTIFIER_RE.match(value):
        raise ValueError(f'Unsafe DB identifier: {value!r}')
    return value


def generate_tenant_db_credentials(slug):
    """Every tenant gets its own MySQL account scoped to only its own
    database, instead of reusing the central admin's credentials — so a
    leaked credential (or any future SQL-injection bug reachable through a
    tenant-facing endpoint) can't be replayed against another tenant's data.
    Username is derived from the slug (already unique) and capped at
    MySQL's 32-character username limit; password is a fresh random token,
    never derived from anything a user supplies."""
    user = f'tenant_{slug}'[:32]
    password = secrets.token_urlsafe(24)
    return user, password


def create_tenant_database(tenant):
    """Create the physical MySQL database for a new tenant, plus a MySQL
    user/password unique to it (tenant.db_user/db_password, generated in
    create_tenant_record) — scoped to only that one database. Granted no
    privileges yet: run_tenant_provisioning elevates it via
    tenant_ddl_privileges() for the initial migrate, then downgrades it to
    DML-only before the tenant goes live. Runs on the central 'default'
    connection, whose DB_USER must have CREATE/CREATE USER/GRANT OPTION
    privileges. utf8mb4 is used for full Unicode support (emoji, etc.)."""
    db_name = _assert_safe_identifier(tenant.db_name)
    db_user = _assert_safe_identifier(tenant.db_user)

    with default_connection.cursor() as cursor:
        cursor.execute(
            f'CREATE DATABASE IF NOT EXISTS `{db_name}` '
            f'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
        )
        # Host is left as '%' (any host) rather than pinned to db_host —
        # db_host is where Django connects TO, not where MySQL should expect
        # this login to originate FROM, and pinning it wrong (e.g. a
        # container hostname vs '127.0.0.1') would just lock the app out.
        cursor.execute(
            f"CREATE USER IF NOT EXISTS '{db_user}'@'%%' IDENTIFIED BY %s",
            [decrypt_db_password(tenant.db_password)],
        )


def _set_tenant_privileges(tenant, privileges):
    db_name = _assert_safe_identifier(tenant.db_name)
    db_user = _assert_safe_identifier(tenant.db_user)
    with default_connection.cursor() as cursor:
        cursor.execute(f"REVOKE ALL PRIVILEGES, GRANT OPTION FROM '{db_user}'@'%'")
        cursor.execute(f"GRANT {privileges} ON `{db_name}`.* TO '{db_user}'@'%'")
        cursor.execute('FLUSH PRIVILEGES')


@contextmanager
def tenant_ddl_privileges(tenant):
    """A tenant's own MySQL account (tenant.db_user) is DML-only at rest —
    SELECT/INSERT/UPDATE/DELETE — so that leaking it, or using it manually
    via phpMyAdmin/DBeaver/mysql CLI, can never create/alter/drop a table.
    Only this server-initiated code path (initial provisioning, module
    enable/disable, field-config sync — all superadmin-gated) briefly
    elevates it to run schema-mutating operations, then always downgrades
    it back, even if the operation raises."""
    _set_tenant_privileges(tenant, 'ALL PRIVILEGES')
    try:
        yield
    finally:
        _set_tenant_privileges(tenant, 'SELECT, INSERT, UPDATE, DELETE')


def drop_tenant_database(tenant):
    """Physically DROP a tenant's entire database and its dedicated MySQL
    user — called when a company is deleted, so deleting it actually removes
    its storage (and revokes its credential) instead of just the Tenant
    registry row. Irreversible."""
    if tenant.slug in connections.databases:
        connections[tenant.slug].close()
    with default_connection.cursor() as cursor:
        cursor.execute(f'DROP DATABASE IF EXISTS `{_assert_safe_identifier(tenant.db_name)}`')
        if tenant.db_user:
            cursor.execute(f"DROP USER IF EXISTS '{_assert_safe_identifier(tenant.db_user)}'@'%'")
    connections.databases.pop(tenant.slug, None)
    settings.DATABASES.pop(tenant.slug, None)


def create_tenant_record(*, company_name, slug, owner_name, owner_email, owner_phone='',
                          logo=None, module_keys=None, tier=Tenant.TIER_TRIAL, plan=Tenant.PLAN_BASIC,
                          primary_color='#f5c518', secondary_color='#171717', db_credentials=None):
    """Phase 1 of onboarding, run synchronously inside the request: creates the
    Tenant row (and saves its logo) and records which modules it selected.
    Everything here only touches the central DB, so it's fast and safe to do
    before the background task provisions the tenant's own database — see
    run_tenant_provisioning, dispatched via tenants.tasks.provision_tenant_task.

    The tenant starts suspended + provisioning_status=pending; nothing can log
    into it (see TenantResolverMiddleware) until the background task flips it
    to active/ready.
    """
    db_credentials = db_credentials or {}
    generated_user, generated_password = generate_tenant_db_credentials(slug)
    tenant = Tenant.objects.create(
        company_name=company_name,
        slug=slug,
        owner_name=owner_name,
        owner_email=owner_email,
        owner_phone=owner_phone,
        logo=logo,
        tier=tier,
        plan=plan,
        primary_color=primary_color,
        secondary_color=secondary_color,
        status=Tenant.STATUS_SUSPENDED,
        provisioning_status=Tenant.PROVISIONING_PENDING,
        db_name=db_credentials.get('name', f'tenant_{slug}'),
        db_host=db_credentials.get('host', 'localhost'),
        db_port=db_credentials.get('port', '3306'),
        # Every tenant gets its own generated MySQL account (see
        # generate_tenant_db_credentials) rather than reusing the central
        # admin's — db_credentials can still override this explicitly
        # (e.g. tests), but nothing does by default anymore. db_password is
        # stored encrypted (see tenants/crypto.py) — decrypt_db_password()
        # recovers the real value wherever it's actually needed.
        db_user=db_credentials.get('user', generated_user),
        db_password=encrypt_db_password(db_credentials.get('password', generated_password)),
    )

    valid_keys = {key for key, _ in MODULE_CHOICES}
    selected_keys = set(module_keys or []) & valid_keys
    for module_key in selected_keys:
        TenantModule.objects.get_or_create(tenant=tenant, module_key=module_key, defaults={'enabled': True})

    return tenant


def run_tenant_provisioning(tenant_id):
    """Phase 2 of onboarding, run in a Celery task (tenants.tasks.
    provision_tenant_task): the actual DB creation, migration, and schema
    sync. Reads which modules to provision from the TenantModule rows phase 1
    already created, so retrying a failed run needs no extra state."""
    tenant = Tenant.objects.get(pk=tenant_id)
    tenant.provisioning_status = Tenant.PROVISIONING_RUNNING
    tenant.save(update_fields=['provisioning_status'])

    try:
        selected_keys = set(tenant.modules.filter(enabled=True).values_list('module_key', flat=True))

        create_tenant_database(tenant)
        register_tenant_database(tenant)

        with tenant_ddl_privileges(tenant):
            call_command('migrate', tenant=tenant.slug, verbosity=0)

            # `migrate` above creates every app's tables regardless of module
            # selection — drop the ones for modules this tenant didn't pick, so an
            # unselected module has no storage from the moment the tenant is created.
            for entity, module_key in ENTITY_TO_MODULE_KEY.items():
                if module_key not in selected_keys:
                    drop_entity_table(tenant, entity)

            sync_tenant_schema(tenant)
    except Exception as exc:
        tenant.provisioning_status = Tenant.PROVISIONING_FAILED
        tenant.provisioning_error = str(exc)[:2000]
        tenant.save(update_fields=['provisioning_status', 'provisioning_error'])
        raise
    else:
        tenant.provisioning_status = Tenant.PROVISIONING_READY
        tenant.status = Tenant.STATUS_ACTIVE
        tenant.save(update_fields=['provisioning_status', 'status'])
