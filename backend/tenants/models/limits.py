from django.db import models

from .tenant import Tenant

TRIAL_RECORD_LIMIT = 5


class TenantTableLimit(models.Model):
    """Per-tenant, per-table max record count for Complete-tier tenants
    (Superadmin-configurable, e.g. 1000/2000/3000 — any number). Trial-tier
    tenants ignore this entirely and are always capped at TRIAL_RECORD_LIMIT.
    No row for a table means "no limit" for a Complete-tier tenant."""

    TABLE_EMPLOYEES = 'employees'
    TABLE_CUSTOMERS = 'customers'
    TABLE_CHOICES = [
        (TABLE_EMPLOYEES, 'Employees'),
        (TABLE_CUSTOMERS, 'Customers'),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='table_limits')
    table_key = models.CharField(max_length=50, choices=TABLE_CHOICES)
    max_records = models.PositiveIntegerField(null=True, blank=True, help_text='Blank = no limit.')

    class Meta:
        app_label = 'tenants'
        unique_together = ('tenant', 'table_key')

    def __str__(self):
        return f'{self.tenant.slug}:{self.table_key}={self.max_records}'
