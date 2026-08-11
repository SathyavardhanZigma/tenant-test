"""Re-exports every view/permission so `from tenants.views import X` keeps
working unchanged for every existing call site."""

from .field_catalog import FieldCatalogViewSet
from .permissions import IsSuperAdmin
from .tenant import TenantViewSet

__all__ = [
    'IsSuperAdmin',
    'TenantViewSet',
    'FieldCatalogViewSet',
]
