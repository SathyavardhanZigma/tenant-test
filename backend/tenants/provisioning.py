"""Dynamic tenant onboarding: create the tenant's database, register its
connection, run its migrations, and sync its Employee/Customer field schema."""

from django.conf import settings
from django.core.management import call_command
from django.db import connection as default_connection
from django.db import connections

from .db_registry import register_tenant_database
from .entities import ENTITY_TO_MODULE_KEY, MODULE_CHOICES
from .models import Tenant, TenantModule
from .schema_sync import drop_entity_table, sync_tenant_schema


def create_tenant_database(db_name):
    """Create the physical MySQL database for a new tenant.
    Runs on the central 'default' connection, whose DB_USER must have CREATE
    privileges. utf8mb4 is used for full Unicode support (emoji, etc.)."""
    with default_connection.cursor() as cursor:
        cursor.execute(
            f'CREATE DATABASE IF NOT EXISTS `{db_name}` '
            f'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
        )


def drop_tenant_database(tenant):
    """Physically DROP a tenant's entire database — called when a company is
    deleted, so deleting it actually removes its storage instead of just the
    Tenant registry row. Irreversible."""
    if tenant.slug in connections.databases:
        connections[tenant.slug].close()
    with default_connection.cursor() as cursor:
        cursor.execute(f'DROP DATABASE IF EXISTS `{tenant.db_name}`')
    connections.databases.pop(tenant.slug, None)
    settings.DATABASES.pop(tenant.slug, None)


def provision_tenant(*, company_name, slug, owner_name, owner_email, owner_phone='',
                      logo=None, module_keys=None, tier=Tenant.TIER_TRIAL, plan=Tenant.PLAN_BASIC,
                      primary_color='#f5c518', secondary_color='#171717', db_credentials=None):
    """End-to-end onboarding flow triggered by the configuration form submit."""
    db_credentials = db_credentials or {}
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
        db_name=db_credentials.get('name', f'tenant_{slug}'),
        db_host=db_credentials.get('host', 'localhost'),
        db_port=db_credentials.get('port', '3306'),
        db_user=db_credentials.get('user', settings.DATABASES['default'].get('USER', '')),
        db_password=db_credentials.get('password', settings.DATABASES['default'].get('PASSWORD', '')),
    )

    create_tenant_database(tenant.db_name)
    register_tenant_database(tenant)

    call_command('migrate', tenant=tenant.slug, verbosity=0)

    valid_keys = {key for key, _ in MODULE_CHOICES}
    selected_keys = set(module_keys or []) & valid_keys
    for module_key in selected_keys:
        TenantModule.objects.get_or_create(tenant=tenant, module_key=module_key, defaults={'enabled': True})

    # `migrate` above creates every app's tables regardless of module
    # selection — drop the ones for modules this tenant didn't pick, so an
    # unselected module has no storage from the moment the tenant is created.
    for entity, module_key in ENTITY_TO_MODULE_KEY.items():
        if module_key not in selected_keys:
            drop_entity_table(tenant, entity)

    sync_tenant_schema(tenant)

    return tenant
