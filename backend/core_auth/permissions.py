from rest_framework.permissions import SAFE_METHODS, BasePermission

from tenants.entities import ENTITY_TO_MODULE_KEY
from tenants.models import Tenant

from .models import StaffModuleGrant, StaffProfile


def get_staff_module_grant(request, module_key):
    """Resolves the current tenant user's StaffModuleGrant for module_key, or
    None if they're an owner (implicit full access), a superadmin (bypasses
    this entirely), or a staff user with no grant for this module at all.

    Used both by IsTenantUserOrSuperAdmin (module-level gate) and by the
    dynamic Employee/Customer serializers (field-level filtering) — see
    modules/employees/serializers.py."""
    token = request.auth
    if token is None or token.get('role') != 'tenant_user':
        return 'bypass'  # superadmin or anything else IsTenantUserOrSuperAdmin already rejected

    if token.get('staff_role', StaffProfile.ROLE_OWNER) == StaffProfile.ROLE_OWNER:
        return 'bypass'

    tenant = getattr(request, 'tenant', None)
    if tenant is None:
        return None

    # request.user is a real auth.User looked up by TenantJWTAuthentication
    # against this tenant's own DB (see core_auth.authentication) — reuse it
    # rather than re-querying by username.
    return StaffModuleGrant.objects.using(tenant.slug).filter(
        profile__user=request.user, module_key=module_key,
    ).prefetch_related('field_grants').first()


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

    On top of that, a staff tenant user (as opposed to that company's owner)
    must additionally hold a StaffModuleGrant for this module: can_view for
    safe methods, can_edit for unsafe methods. Owners bypass this — they
    implicitly get whatever the company itself is entitled to.
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

        # Views for a FieldCatalog-dynamic entity (Employee/Customer) declare
        # `entity`; views for a fixed-schema module with no dynamic fields
        # (e.g. RoleViewSet) declare `module_key` directly instead, since
        # there's no corresponding ENTITY_TO_MODULE_KEY entry for them.
        module_key = getattr(view, 'module_key', None) or ENTITY_TO_MODULE_KEY.get(getattr(view, 'entity', None))
        if not module_key:
            return True

        if not tenant.modules.filter(module_key=module_key, enabled=True).exists():
            return False

        grant = get_staff_module_grant(request, module_key)
        if grant == 'bypass':
            return True
        if grant is None:
            return False
        if request.method in SAFE_METHODS:
            return grant.can_view
        return grant.can_edit


class IsTenantOwner(BasePermission):
    """Restricts a tenant-scoped view to that company's own owner account (or
    superadmin). Used by the staff-permission management endpoints — a
    company manages its own staff's module/field access, but staff members
    can't grant themselves (or each other) more access.

    Also enforced module-enabled the same way IsTenantUserOrSuperAdmin does,
    but only for views that opt in via a `module_key` attribute (e.g.
    RoleViewSet's write actions) — views that don't set one (e.g. the staff
    permission endpoints, which aren't gated by any module toggle) are
    unaffected."""

    def has_permission(self, request, view):
        token = request.auth
        if token is None:
            return False

        role = token.get('role')
        if role == 'superadmin':
            return True
        if role != 'tenant_user' or token.get('tenant_slug') != getattr(request.tenant, 'slug', None):
            return False

        if token.get('staff_role', StaffProfile.ROLE_OWNER) != StaffProfile.ROLE_OWNER:
            return False

        module_key = getattr(view, 'module_key', None)
        if module_key:
            tenant = getattr(request, 'tenant', None)
            if tenant is None or not tenant.modules.filter(module_key=module_key, enabled=True).exists():
                return False

        return True
