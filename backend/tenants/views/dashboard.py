"""Tenant-facing dashboard + capability endpoints.

Both are mounted under /api/<slug>/ and use the same auth/permission pair as
Employee/Customer CRUD, so a tenant user can only ever read its own company's
dashboard and a superadmin can read any — matching the existing behaviour of
IsTenantUserOrSuperAdmin.
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core_auth.permissions import IsTenantUserOrSuperAdmin

from ..capabilities import resolve
from ..dashboard import build_dashboard
from .permissions import RequiresCapability


class TenantDashboardView(APIView):
    """The tenant's own dashboard, shaped by its resolved capabilities.

    Returns 403 FEATURE_NOT_ENABLED when `dashboard` itself is off for this
    tenant, rather than an empty 200 — an experienced user calling this URL
    directly must get the same answer the UI implies.
    """

    permission_classes = [IsAuthenticated, IsTenantUserOrSuperAdmin, RequiresCapability]
    capability_key = 'dashboard'

    def get(self, request, **kwargs):
        return Response(build_dashboard(request.tenant))


class TenantCapabilitiesView(APIView):
    """The effective capability map for this tenant, for the frontend to render
    from. Only enabled entries are returned — a tenant has no business knowing
    which widgets exist that it didn't buy.
    """

    permission_classes = [IsAuthenticated, IsTenantUserOrSuperAdmin]

    def get(self, request, **kwargs):
        resolved = resolve(request.tenant)
        return Response({
            key: {'settings': value['settings']}
            for key, value in resolved.items()
            if value['enabled']
        })
