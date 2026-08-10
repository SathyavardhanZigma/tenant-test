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
