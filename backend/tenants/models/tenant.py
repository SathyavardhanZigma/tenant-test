from django.db import models


class Tenant(models.Model):
    """Central registry of every onboarded company. Lives in the default DB only."""

    STATUS_ACTIVE = 'active'
    STATUS_SUSPENDED = 'suspended'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_SUSPENDED, 'Suspended'),
    ]

    TIER_TRIAL = 'trial'
    TIER_COMPLETE = 'complete'
    TIER_CHOICES = [
        (TIER_TRIAL, 'Trial'),
        (TIER_COMPLETE, 'Complete'),
    ]

    PLAN_BASIC = 'basic'
    PLAN_ENTERPRISE = 'enterprise'
    PLAN_CHOICES = [
        (PLAN_BASIC, 'Basic'),
        (PLAN_ENTERPRISE, 'Enterprise'),
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
    tier = models.CharField(
        max_length=20, choices=TIER_CHOICES, default=TIER_TRIAL,
        help_text='Trial tenants are hard-capped at 5 records per table regardless of '
                   'TenantTableLimit rows. Complete tenants use whatever limit Superadmin '
                   'configures per table (see TenantTableLimit), or no limit if unset.',
    )
    plan = models.CharField(
        max_length=20, choices=PLAN_CHOICES, default=PLAN_BASIC,
        help_text='Basic: tenant users get login + read-only access to all data. '
                   'Enterprise: tenant users get full CRUD. Superadmin always has full '
                   'CRUD on every tenant regardless of this setting.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'tenants'

    def __str__(self):
        return self.company_name


class TenantModule(models.Model):
    """Which of the fixed modules (employees, customers) a tenant has enabled."""

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='modules')
    module_key = models.SlugField(max_length=100)
    enabled = models.BooleanField(default=True)

    class Meta:
        app_label = 'tenants'
        unique_together = ('tenant', 'module_key')

    def __str__(self):
        return f'{self.tenant.slug}:{self.module_key}'
