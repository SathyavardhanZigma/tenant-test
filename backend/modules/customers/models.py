from django.db import models


class Customer(models.Model):
    """Core columns shared by every tenant. Tenant-specific columns (drawn from
    the FieldCatalog/TenantFieldConfig selection) are added dynamically on top
    of this table by tenants.schema_sync.sync_tenant_schema — do not hardcode
    per-company fields here."""

    code = models.CharField(
        max_length=64, unique=True, blank=True, null=True,
        help_text='Auto-generated tenant-scoped record code (e.g. nike-CUST-001) — '
                   'assigned server-side after creation from the row\'s own auto-increment id, '
                   'never client-supplied. See tenants.mixins.TenantEntityViewSetMixin.perform_create.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'customers'
