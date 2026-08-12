"""Re-exports every model so `from tenants.models import X` keeps working
unchanged for every existing call site — this package split is a pure
code-organization change, not a schema change (see each submodule's
Meta.app_label = 'tenants', identical to the original single-file models.py)."""

from .audit import TenantAuditLog
from .capability import TenantCapability
from .field_catalog import FieldCatalog, TenantFieldConfig
from .limits import TRIAL_RECORD_LIMIT, TenantTableLimit
from .superadmin import SuperAdminUser
from .tenant import Tenant, TenantModule

__all__ = [
    'Tenant',
    'TenantModule',
    'TRIAL_RECORD_LIMIT',
    'TenantTableLimit',
    'FieldCatalog',
    'TenantFieldConfig',
    'TenantCapability',
    'SuperAdminUser',
    'TenantAuditLog',
]
