"""Generic per-table unique record ID generation, in the same style as
PHP's uniqid() . rand(10000, 99999): a time-based hex component plus a random
suffix, so IDs are unique without needing a DB round-trip or a lock. Use
generate_unique_id() directly for any table, or generate_entity_code() for
the tenant-scoped Employee/Customer record codes (see
tenants.entities.ENTITY_CODE_PREFIX and tenants.mixins.TenantEntityViewSetMixin).
"""

import random
import time


def generate_unique_id(prefix: str = "", length: int | None = None) -> str:
    """
    Mimics PHP's uniqid() . rand(10000, 99999)
    Example: '652b8df64c6b310345' or with prefix 'EMP652b8df64c6b310345'
    """
    # PHP uniqid() uses current time in microseconds, hex-encoded
    unique_part = hex(int(time.time() * 1000000))[2:]  # strip '0x'
    random_part = str(random.randint(10000, 99999))
    core = f"{unique_part}{random_part}"
    if length is not None:
        if length < 1:
            core = ""
        else:
            core = core[-length:]
    return f"{prefix}{core}"


def generate_entity_code(tenant_slug: str, entity_prefix: str, length: int | None = None) -> str:
    """Readable, tenant-scoped record code for one row of one table, e.g.
    tenant_slug='nike' + entity_prefix='EMP' -> 'nike-EMP-652b8df64c6b310345'.
    `entity_prefix` should come from tenants.entities.ENTITY_CODE_PREFIX so
    every table's prefix stays defined in one place."""
    return f"{tenant_slug}-{entity_prefix}-{generate_unique_id(length=length)}"
