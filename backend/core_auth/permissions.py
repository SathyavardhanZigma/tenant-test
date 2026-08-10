from rest_framework.permissions import BasePermission


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
        if role == 'superadmin':
            return True
        if role == 'tenant_user':
            return token.get('tenant_slug') == getattr(request.tenant, 'slug', None)
        return False
