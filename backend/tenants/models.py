from django.db import models


class Tenant(models.Model):
    """Central registry of every onboarded company. Lives in the default DB only."""

    STATUS_ACTIVE = 'active'
    STATUS_SUSPENDED = 'suspended'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_SUSPENDED, 'Suspended'),
    ]

    company_name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=100, unique=True)
    owner_name = models.CharField(max_length=255)
    owner_email = models.EmailField()
    owner_phone = models.CharField(max_length=32, blank=True)
    logo = models.ImageField(upload_to='tenant_logos/', blank=True, null=True)

    db_name = models.CharField(max_length=100, unique=True)
    db_host = models.CharField(max_length=255, default='localhost')
    db_port = models.CharField(max_length=10, default='3306')
    db_user = models.CharField(max_length=100)
    db_password = models.CharField(max_length=255)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.company_name


class TenantModule(models.Model):
    """Which selectable modules (Employees, Customers, Inventory, ...) a tenant has enabled."""

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='modules')
    module_key = models.SlugField(max_length=100)
    enabled = models.BooleanField(default=True)

    class Meta:
        unique_together = ('tenant', 'module_key')

    def __str__(self):
        return f'{self.tenant.slug}:{self.module_key}'


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
        ('email', 'Email'),
        ('text', 'Text'),
    ]

    entity = models.CharField(max_length=20, choices=ENTITY_CHOICES)
    field_key = models.SlugField(max_length=100)
    label = models.CharField(max_length=255)
    data_type = models.CharField(max_length=20, choices=DATA_TYPE_CHOICES, default='string')
    options = models.JSONField(blank=True, null=True, help_text='Choices, for enum fields')
    is_required_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
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
        unique_together = ('tenant', 'field')
        ordering = ['order']

    def __str__(self):
        return f'{self.tenant.slug}:{self.field.field_key}={self.enabled}'


class SuperAdminUser(models.Model):
    """Superadmin credentials, kept separate from tenant-scoped Django auth users.
    Passwords must be hashed (use django.contrib.auth.hashers) — never store plaintext."""

    username = models.CharField(max_length=150, unique=True)
    password_hash = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.username


class TenantAuditLog(models.Model):
    """Records superadmin actions taken against a tenant's data (impersonation,
    cross-tenant edits, suspensions) for audit purposes."""

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='audit_logs')
    actor = models.CharField(max_length=150, help_text='Superadmin username who performed the action')
    action = models.CharField(max_length=255)
    detail = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.tenant.slug}:{self.action}@{self.created_at:%Y-%m-%d %H:%M}'
