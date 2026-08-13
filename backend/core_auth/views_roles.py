"""Tenant-scoped Role CRUD, mounted at /api/<tenant_slug>/roles/ in
config/urls.py. Backs the Employee "Role" field's dropdown (FieldCatalog
data_type='role') — each company keeps its own role list in its own
database, extendable at any time without a code change or Superadmin."""

from rest_framework import viewsets
from rest_framework.permissions import SAFE_METHODS

from .models import Role
from .permissions import IsTenantOwner, IsTenantUserOrSuperAdmin
from .serializers import RoleSerializer


class RoleViewSet(viewsets.ModelViewSet):
    """GET: any authenticated tenant user (or Superadmin) — needed so every
    staff member editing Employee records can populate the Role dropdown.
    POST/PATCH/DELETE: owner (or Superadmin) only — adding/removing roles is
    an administrative change, same tier as staff permission management.

    Roles is a Superadmin-toggleable module like Employees/Customers (see
    tenants.entities.MODULE_CHOICES) — `module_key` (rather than `entity`,
    which only exists for FieldCatalog-dynamic-schema modules) is what tells
    IsTenantUserOrSuperAdmin/IsTenantOwner to enforce that toggle here."""

    serializer_class = RoleSerializer
    module_key = 'roles'

    def get_queryset(self):
        return Role.objects.all()

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsTenantUserOrSuperAdmin()]
        return [IsTenantOwner()]
