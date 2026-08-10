"""Dynamic tenant onboarding: create the tenant's database, register its
connection, run its migrations, and sync its Employee/Customer field schema."""

from django.conf import settings
from django.core.management import call_command
from django.db import connection as default_connection

from .db_registry import register_tenant_database
from .models import Feature, Plan, Tenant, TenantModule, TenantSubscription
from .schema_sync import sync_tenant_schema


def create_tenant_database(db_name):
    """Create the physical MySQL database for a new tenant.
    Runs on the central 'default' connection, whose DB_USER must have CREATE
    privileges. utf8mb4 is used for full Unicode support (emoji, etc.)."""
    with default_connection.cursor() as cursor:
        cursor.execute(
            f'CREATE DATABASE IF NOT EXISTS `{db_name}` '
            f'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
        )


def provision_tenant(*, company_name, slug, owner_name, owner_email, owner_phone='',
                      logo=None, module_keys=None, plan_key='', db_credentials=None):
    """End-to-end onboarding flow triggered by the configuration form submit."""
    db_credentials = db_credentials or {}
    tenant = Tenant.objects.create(
        company_name=company_name,
        slug=slug,
        owner_name=owner_name,
        owner_email=owner_email,
        owner_phone=owner_phone,
        logo=logo,
        db_name=db_credentials.get('name', f'tenant_{slug}'),
        db_host=db_credentials.get('host', 'localhost'),
        db_port=db_credentials.get('port', '3306'),
        db_user=db_credentials.get('user', settings.DATABASES['default'].get('USER', '')),
        db_password=db_credentials.get('password', settings.DATABASES['default'].get('PASSWORD', '')),
    )

    create_tenant_database(tenant.db_name)
    register_tenant_database(tenant)

    call_command('migrate', tenant=tenant.slug, verbosity=0)

    plan = Plan.objects.filter(key=plan_key, is_active=True).first() if plan_key else None
    selected_keys = set(module_keys or [])
    if plan and not selected_keys:
        selected_keys = set(plan.features.filter(is_active=True).values_list('key', flat=True))

    TenantSubscription.objects.create(tenant=tenant, plan=plan)

    features_by_key = {feature.key: feature for feature in Feature.objects.filter(key__in=selected_keys)}
    for module_key in selected_keys:
        TenantModule.objects.get_or_create(
            tenant=tenant,
            module_key=module_key,
            defaults={'feature': features_by_key.get(module_key), 'enabled': True},
        )

    sync_tenant_schema(tenant)

    return tenant
