from django.db import models

from .tenant import Tenant


class FieldCatalog(models.Model):
    """Master list of every field Superadmin has made available per entity type."""

    ENTITY_EMPLOYEE = 'employee'
    ENTITY_CUSTOMER = 'customer'
    ENTITY_CHOICES = [
        (ENTITY_EMPLOYEE, 'Employee'),
        (ENTITY_CUSTOMER, 'Customer'),
    ]

    DATA_TYPE_CHOICES = [
        ('string', 'String'),
        ('integer', 'Integer'),
        ('date', 'Date'),
        ('boolean', 'Boolean'),
        ('enum', 'Enum'),
        ('role', 'Role'),
        ('email', 'Email'),
        ('text', 'Text'),
    ]

    entity = models.CharField(max_length=20, choices=ENTITY_CHOICES)
    field_key = models.SlugField(max_length=100)
    label = models.CharField(max_length=255)
    data_type = models.CharField(max_length=20, choices=DATA_TYPE_CHOICES, default='string')
    options = models.JSONField(
        blank=True, null=True,
        help_text="Choices, for 'enum' fields. Not used for 'role' fields — "
                   "those pull live choices from the tenant's own core_auth.Role table instead.",
    )
    is_required_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'tenants'
        unique_together = ('entity', 'field_key')

    def __str__(self):
        return f'{self.entity}.{self.field_key}'


class TenantFieldConfig(models.Model):
    """Per-tenant selection of which catalog fields are enabled, e.g. Tata enables 8/14
    employee fields while Tesla enables all 14."""

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='field_configs')
    field = models.ForeignKey(FieldCatalog, on_delete=models.CASCADE)
    enabled = models.BooleanField(default=True)
    is_required = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        app_label = 'tenants'
        unique_together = ('tenant', 'field')
        ordering = ['order']

    def __str__(self):
        return f'{self.tenant.slug}:{self.field.field_key}={self.enabled}'
