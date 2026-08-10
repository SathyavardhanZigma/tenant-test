from rest_framework.permissions import BasePermission

from tenants.features import entity_to_feature_key


class IsTenantUserOrSuperAdmin(BasePermission):
    """Allows access to a tenant-scoped view (Employee/Customer CRUD) to either:
    - a tenant user whose JWT's tenant_slug matches the tenant resolved for
      this request (request.tenant, set by TenantResolverMiddleware), or
    - a superadmin JWT (role=superadmin), which may access ANY company —
      this is what lets Superadmin open a tenant's data directly, per the
      "superadmin can access all the db's with respect to the companies"
      requirement.
    """

    def has_permission(self, request, view):
        token = request.auth
        if token is None:
            return False

        role = token.get('role')
        has_valid_actor = False
        if role == 'superadmin':
            has_valid_actor = True
        elif role == 'tenant_user':
            has_valid_actor = token.get('tenant_slug') == getattr(request.tenant, 'slug', None)

        if not has_valid_actor:
            return False

        feature_key = entity_to_feature_key().get(getattr(view, 'entity', None))
        if not feature_key:
            return True

        tenant = getattr(request, 'tenant', None)
        return (
            tenant is not None
            and tenant.modules.filter(module_key=feature_key, enabled=True).exists()
        )
