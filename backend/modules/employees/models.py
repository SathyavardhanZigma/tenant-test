from django.conf import settings
from django.db import models


class Employee(models.Model):
    """Core columns shared by every tenant. Tenant-specific columns (drawn from
    the FieldCatalog/TenantFieldConfig selection) are added dynamically on top
    of this table by tenants.schema_sync.sync_tenant_schema — do not hardcode
    per-company fields here."""

    code = models.CharField(
        max_length=64, unique=True, blank=True, null=True,
        help_text='Auto-generated tenant-scoped record code (e.g. nike-EMP-001) — '
                   'assigned server-side after creation from the row\'s own auto-increment id, '
                   'never client-supplied. See tenants.mixins.TenantEntityViewSetMixin.perform_create.',
    )
    # Optional login this employee can use to sign in (see
    # core_auth.models.StaffProfile) — set via the Employees create/update
    # endpoint (modules/employees/serializers.py). Most employee records
    # have no login at all; this only exists for the subset who need to log
    # into the tenant app themselves. Lives in the same tenant DB as
    # auth.User, so the FK is a normal same-database relation.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employee_record',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'employees'
