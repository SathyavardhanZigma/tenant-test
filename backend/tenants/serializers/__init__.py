"""Re-exports every serializer so `from tenants.serializers import X` keeps
working unchanged for every existing call site."""

from .field_catalog import FieldCatalogSerializer
from .limits import TenantTableLimitSerializer
from .tenant import TenantModuleSerializer, TenantOnboardingSerializer, TenantSerializer

__all__ = [
    'TenantModuleSerializer',
    'TenantSerializer',
    'TenantOnboardingSerializer',
    'TenantTableLimitSerializer',
    'FieldCatalogSerializer',
]
