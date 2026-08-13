# Tenant end-user auth reuses Django's built-in auth.User (created per tenant
# DB by the 'employees'/'customers' tenant migrations, or a dedicated
# tenant_users app if richer per-tenant roles are needed later).
# Superadmin auth is tenants.models.SuperAdminUser, kept in the central DB.
from django.conf import settings
from django.db import models

from tenants.entities import MODULE_CHOICES


class StaffProfile(models.Model):
    """Owner/staff role for a tenant's own auth.User account. Lives in that
    tenant's own physical DB (see TENANT_APPS), one row per company since
    each company has a fully separate auth_user table.

    Owners implicitly get everything the company is entitled to (see
    tenants.TenantModule/TenantFieldConfig) — they never need explicit grant
    rows. Staff only see what's explicitly granted via StaffModuleGrant/
    StaffFieldGrant, always capped by what Superadmin has enabled for the
    company."""

    ROLE_OWNER = 'owner'
    ROLE_STAFF = 'staff'
    ROLE_CHOICES = [
        (ROLE_OWNER, 'Owner'),
        (ROLE_STAFF, 'Staff'),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='staff_profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_STAFF)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'core_auth'

    def __str__(self):
        return f'{self.user.username}:{self.role}'


class StaffModuleGrant(models.Model):
    """Which modules (employees/customers) a staff user can see, and whether
    they can edit (vs. read-only) that module's records. Only meaningful for
    role=staff profiles — owners bypass this entirely."""

    profile = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='module_grants')
    module_key = models.SlugField(max_length=100, choices=MODULE_CHOICES)
    can_view = models.BooleanField(default=True)
    can_edit = models.BooleanField(default=False)

    class Meta:
        app_label = 'core_auth'
        unique_together = ('profile', 'module_key')

    def __str__(self):
        return f'{self.profile.user.username}:{self.module_key}'


class StaffFieldGrant(models.Model):
    """Which fields of a granted module a staff user can see/edit. Absence of
    a row for a field means that field is hidden from this staff user, even
    if the module itself is granted via StaffModuleGrant."""

    module_grant = models.ForeignKey(StaffModuleGrant, on_delete=models.CASCADE, related_name='field_grants')
    field_key = models.SlugField(max_length=100)
    can_view = models.BooleanField(default=True)
    can_edit = models.BooleanField(default=False)

    class Meta:
        app_label = 'core_auth'
        unique_together = ('module_grant', 'field_key')

    def __str__(self):
        return f'{self.module_grant}:{self.field_key}'


class Role(models.Model):
    """A company's own list of job roles (e.g. Manager, Team Lead, Developer)
    for its Employee "Role" field (FieldCatalog data_type='role') — lives in
    that tenant's own physical DB, so each company manages its own list
    independently rather than sharing one Superadmin-fixed set. Adding a new
    role is a plain CRUD write here, not a code change — see
    core_auth.views_roles.RoleViewSet."""

    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'core_auth'
        ordering = ['name']

    def __str__(self):
        return self.name
