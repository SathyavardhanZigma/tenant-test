from rest_framework import permissions


class IsSuperAdmin(permissions.BasePermission):
    """Only a validated superadmin JWT (role=superadmin, see
    core_auth.views.SuperAdminLoginView) may manage the tenant registry,
    field catalog, or any tenant's configuration."""

    def has_permission(self, request, view):
        return request.auth is not None and request.auth.get('role') == 'superadmin'
