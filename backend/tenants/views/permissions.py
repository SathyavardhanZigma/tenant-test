from rest_framework import permissions


class IsSuperAdmin(permissions.BasePermission):
    """Only a validated superadmin JWT (role=superadmin, see
    core_auth.views.SuperAdminLoginView) may manage the tenant registry,
    field catalog, or any tenant's configuration."""

    def has_permission(self, request, view):
        return request.auth is not None and request.auth.get('role') == 'superadmin'


class RequiresCapability(permissions.BasePermission):
    """Rejects a request whose view declares a `capability_key` that isn't
    enabled for the resolved tenant.

    This is the backend half of feature gating — the half that matters. React
    not rendering a widget is a convenience; this is what stops someone calling
    the URL by hand. Applies to superadmins too: a capability being off is a
    statement about what the *tenant* bought, so a superadmin browsing that
    tenant should see the same product, not a privileged superset.
    """

    message = 'FEATURE_NOT_ENABLED'

    def has_permission(self, request, view):
        from ..capabilities import is_enabled

        key = getattr(view, 'capability_key', None)
        if key is None:
            return True

        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            return False

        return is_enabled(tenant, key)
