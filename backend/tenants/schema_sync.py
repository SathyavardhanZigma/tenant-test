"""Applies a tenant's TenantFieldConfig selection as real ADD COLUMN
operations on that tenant's Employee/Customer tables, so e.g. Tata's table has
8 columns and Tesla's has 14 — driven by data, not per-tenant migration files.
"""

from django.db import connections

from modules.customers.models import Customer
from modules.employees.models import Employee

from .dynamic_fields import build_model_field

ENTITY_TO_MODEL = {
    'employee': Employee,
    'customer': Customer,
}


def sync_tenant_schema(tenant):
    """Bring a tenant's Employee/Customer tables in line with its enabled
    TenantFieldConfig rows: add columns for newly enabled catalog fields,
    leave disabled ones in place (soft-hide at the serializer layer rather
    than dropping data)."""
    connection = connections[tenant.slug]
    configs = tenant.field_configs.select_related('field').filter(enabled=True)

    with connection.schema_editor() as schema_editor:
        for cfg in configs:
            model = ENTITY_TO_MODEL.get(cfg.field.entity)
            if model is None:
                continue

            field_name = cfg.field.field_key
            if _column_exists(connection, model._meta.db_table, field_name):
                continue

            field = build_model_field(cfg.field.data_type)
            field.set_attributes_from_name(field_name)
            schema_editor.add_field(model, field)


def _column_exists(connection, table_name, column_name):
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(cursor, table_name)
    return any(col.name == column_name for col in description)


def _table_exists(connection, table_name):
    with connection.cursor() as cursor:
        return table_name in connection.introspection.table_names(cursor)


def drop_entity_table(tenant, entity):
    """Physically DROP a tenant's Employee/Customer table — called when a
    module is disabled for that tenant, so disabling e.g. Customers actually
    removes its storage instead of just hiding it behind field config."""
    model = ENTITY_TO_MODEL.get(entity)
    if model is None:
        return
    connection = connections[tenant.slug]
    if not _table_exists(connection, model._meta.db_table):
        return
    with connection.schema_editor() as schema_editor:
        schema_editor.delete_model(model)


def ensure_entity_table(tenant, entity):
    """Recreate a tenant's Employee/Customer base table if it was previously
    dropped (module re-enabled) — new columns for the tenant's configured
    fields are then added by sync_tenant_schema."""
    model = ENTITY_TO_MODEL.get(entity)
    if model is None:
        return
    connection = connections[tenant.slug]
    if _table_exists(connection, model._meta.db_table):
        return
    with connection.schema_editor() as schema_editor:
        schema_editor.create_model(model)
