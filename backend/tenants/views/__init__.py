"""Re-exports every view/permission so `from tenants.views import X` keeps
working unchanged for every existing call site."""

from .dashboard import TenantCapabilitiesView, TenantDashboardView
from .field_catalog import FieldCatalogViewSet
from .permissions import IsSuperAdmin, RequiresCapability
from .tenant import TenantViewSet

__all__ = [
    'IsSuperAdmin',
    'RequiresCapability',
    'TenantViewSet',
    'FieldCatalogViewSet',
    'TenantDashboardView',
    'TenantCapabilitiesView',
]
