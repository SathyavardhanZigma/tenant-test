from rest_framework.permissions import SAFE_METHODS, BasePermission

from tenants.entities import ENTITY_TO_MODULE_KEY
from tenants.models import Tenant


class IsTenantUserOrSuperAdmin(BasePermission):
    """Allows access to a tenant-scoped view (Employee/Customer CRUD) to either:
    - a tenant user whose JWT's tenant_slug matches the tenant resolved for
      this request (request.tenant, set by TenantResolverMiddleware), or
    - a superadmin JWT (role=superadmin), which may access ANY company —
      this is what lets Superadmin open a tenant's data directly, per the
      "superadmin can access all the db's with respect to the companies"
      requirement. Superadmin always has full CRUD regardless of plan/tier.

    Also requires the relevant module (employees/customers) to be enabled
    for this tenant, and — for a tenant user — respects the tenant's plan:
    Basic gets login + read-only access to all data; Enterprise gets full
    CRUD. See Tenant.plan.
    """

    def has_permission(self, request, view):
        token = request.auth
        if token is None:
            return False

        role = token.get('role')
        if role == 'superadmin':
            return True
        if role != 'tenant_user' or token.get('tenant_slug') != getattr(request.tenant, 'slug', None):
            return False

        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            return False

        if tenant.plan == Tenant.PLAN_BASIC and request.method not in SAFE_METHODS:
            return False

        module_key = ENTITY_TO_MODULE_KEY.get(getattr(view, 'entity', None))
        if not module_key:
            return True

        return tenant.modules.filter(module_key=module_key, enabled=True).exists()
