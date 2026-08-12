"""Trial (TRIAL_RECORD_LIMIT records) vs Complete (Superadmin-configurable
per table) record limits — see tenants.models.Tenant.tier and TenantTableLimit."""

from .models import TRIAL_RECORD_LIMIT


def effective_limit(tenant, table_key):
    """Returns the max record count for this tenant's table, or None for no
    limit. Trial tenants are always capped at TRIAL_RECORD_LIMIT regardless
    of any TenantTableLimit row; Complete tenants use their configured
    max_records (None = unlimited if never configured)."""
    from .models import Tenant

    if tenant.tier == Tenant.TIER_TRIAL:
        return TRIAL_RECORD_LIMIT

    row = tenant.table_limits.filter(table_key=table_key).first()
    return row.max_records if row else None
