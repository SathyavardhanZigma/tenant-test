"""Single source of truth mapping a FieldCatalog data_type to a Django model
field. Used both to physically add the column to a tenant's table
(schema_sync.sync_tenant_schema) and to declare that same field on the
per-tenant dynamic model class (dynamic_models.get_dynamic_model) so the ORM
knows its real Python/SQL type instead of treating everything as text.
"""

from django.db import models


def build_model_field(data_type, *, nullable=True):
    if data_type == 'text':
        return models.TextField(null=nullable, blank=nullable)
    if data_type == 'integer':
        return models.IntegerField(null=nullable, blank=nullable)
    if data_type == 'date':
        return models.DateField(null=nullable, blank=nullable)
    if data_type == 'boolean':
        return models.BooleanField(null=nullable, blank=True, default=False)
    if data_type == 'enum':
        return models.CharField(max_length=100, null=nullable, blank=nullable)
    if data_type == 'email':
        return models.EmailField(null=nullable, blank=nullable)
    return models.CharField(max_length=255, null=nullable, blank=nullable)  # 'string' and fallback
