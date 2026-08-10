from django.db import models


class Customer(models.Model):
    """Core columns shared by every tenant. Tenant-specific columns (drawn from
    the FieldCatalog/TenantFieldConfig selection) are added dynamically on top
    of this table by tenants.schema_sync.sync_tenant_schema — do not hardcode
    per-company fields here."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'customers'
