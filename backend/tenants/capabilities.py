"""Capability registry — the product catalogue of everything Zigma can turn on
or tune per tenant.

This is deliberately a code-seeded dict rather than a database table, exactly
like entities.MODULE_CHOICES: at POC scale the registry changes when we ship a
release, not when a salesperson clicks something, so git history + code review
are worth more than a CRUD screen. Promote to a DB table only when tenants need
to define their own capabilities (they don't, and per the product decision the
tenant admin never configures at feature level).

Three things make this more than a flat checkbox list:

1. `parent` gives cascade + dependency in one column. A capability whose parent
   resolves off is itself off, recursively — so turning off `dashboard` implies
   every widget under it without anyone hand-unticking children. Their stored
   overrides survive, so re-enabling the parent restores the prior setup.
2. `settings_schema` keeps the per-capability JSON honest. Free-form JSON would
   let any typo through to the frontend; every key here is declared with a type
   and a range, and resolve() drops anything unknown or out of bounds.
3. `tier` is the lock model. LOCKED capabilities are product invariants nobody
   overrides, PACKAGED ones move only by changing the tenant's plan/tier, and
   TUNABLE ones are what Zigma may set per tenant. This is what makes "our
   default product" a definable thing (every capability at its default, zero
   overrides) instead of a point in an infinite configuration space.
"""

# Lock tiers — see module docstring.
TIER_LOCKED = 'locked'
TIER_PACKAGED = 'packaged'
TIER_TUNABLE = 'tunable'

# Setting value types, checked by _coerce_setting.
T_BOOL = 'boolean'
T_INT = 'integer'
T_ENUM = 'enum'

CAPABILITIES = {
    'dashboard': {
        'label': 'Dashboard',
        'parent': None,
        'tier': TIER_TUNABLE,
        'default_enabled': True,
        'settings_schema': {},
    },
    'dashboard.stats': {
        'label': 'Record Statistics',
        'parent': 'dashboard',
        'tier': TIER_TUNABLE,
        'default_enabled': True,
        'settings_schema': {
            'show_employee_count': {'type': T_BOOL, 'default': True},
            'show_customer_count': {'type': T_BOOL, 'default': True},
            'show_limit_usage': {
                'type': T_BOOL, 'default': True,
                'help': 'Show "12 / 500 records used" against the tenant table limit.',
            },
        },
    },
    'dashboard.recent_activity': {
        'label': 'Recent Activity',
        'parent': 'dashboard',
        'tier': TIER_TUNABLE,
        'default_enabled': True,
        'settings_schema': {
            'row_count': {
                'type': T_INT, 'default': 5, 'min': 3, 'max': 25,
                'help': 'How many recent records to list.',
            },
            'source': {
                'type': T_ENUM, 'default': 'both',
                'choices': ['both', 'employees', 'customers'],
            },
        },
    },
    'dashboard.module_shortcuts': {
        'label': 'Module Shortcut Cards',
        'parent': 'dashboard',
        'tier': TIER_TUNABLE,
        'default_enabled': True,
        'settings_schema': {
            'show_descriptions': {'type': T_BOOL, 'default': True},
        },
    },
    # Audit logging is a compliance guarantee, not a per-client preference —
    # it exists here so the config UI can *show* it as permanently on rather
    # than leaving people wondering whether it's configurable.
    'platform.audit_log': {
        'label': 'Superadmin Audit Logging',
        'parent': None,
        'tier': TIER_LOCKED,
        'default_enabled': True,
        'settings_schema': {},
    },
}


def default_settings(key):
    """The declared defaults for one capability, as a plain dict."""
    schema = CAPABILITIES[key]['settings_schema']
    return {name: spec['default'] for name, spec in schema.items()}


def _coerce_setting(spec, value):
    """Validate one stored value against its schema entry, returning the
    default when it doesn't fit. Stored overrides are written by our own
    config screen, but they outlive schema changes — a setting whose type or
    range narrowed in a later release must degrade to the default rather than
    reaching the frontend as something it can't render."""
    kind = spec['type']

    if kind == T_BOOL:
        return bool(value) if isinstance(value, bool) else spec['default']

    if kind == T_INT:
        if not isinstance(value, int) or isinstance(value, bool):
            return spec['default']
        if 'min' in spec and value < spec['min']:
            return spec['default']
        if 'max' in spec and value > spec['max']:
            return spec['default']
        return value

    if kind == T_ENUM:
        return value if value in spec['choices'] else spec['default']

    return spec['default']


def resolve(tenant):
    """Collapse registry defaults + this tenant's stored overrides into the
    effective capability set, applying parent cascade.

    Returns {key: {'enabled': bool, 'settings': {...}, 'label', 'tier',
    'parent'}} for every registry key. Callers get the whole map (not just
    enabled ones) so the config UI can render disabled capabilities too; the
    API layer filters when talking to a tenant.

    One query, no N+1: overrides come back in a single fetch and the cascade
    is computed in Python.
    """
    from .models import TenantCapability

    overrides = {
        row.capability_key: row
        for row in TenantCapability.objects.filter(tenant=tenant)
    }

    resolved = {}
    for key, spec in CAPABILITIES.items():
        row = overrides.get(key)

        if spec['tier'] == TIER_LOCKED:
            # Locked capabilities ignore stored rows entirely — that's the
            # whole point of the tier, and it means a stale override row from
            # before a capability was locked can't weaken a product invariant.
            enabled = spec['default_enabled']
            settings = default_settings(key)
        else:
            enabled = row.enabled if row else spec['default_enabled']
            stored = (row.settings_json or {}) if row else {}
            settings = {
                name: _coerce_setting(sub, stored[name]) if name in stored else sub['default']
                for name, sub in spec['settings_schema'].items()
            }

        resolved[key] = {
            'label': spec['label'],
            'parent': spec['parent'],
            'tier': spec['tier'],
            'enabled': enabled,
            'settings': settings,
        }

    _apply_cascade(resolved)
    return resolved


def _apply_cascade(resolved):
    """Force a capability off when any ancestor is off. Mutates in place.

    Note this only ever *removes* access — a child can't re-enable itself by
    being ticked while its parent is off, which is the invariant that lets the
    frontend trust a single `enabled` boolean without walking the tree itself.
    """
    for key in resolved:
        parent = resolved[key]['parent']
        while parent is not None:
            if not resolved[parent]['enabled']:
                resolved[key]['enabled'] = False
                break
            parent = resolved[parent]['parent']


def is_enabled(tenant, key):
    """Single-capability check for permission classes and views."""
    return resolve(tenant).get(key, {}).get('enabled', False)


def registry_tree():
    """The registry as a nested structure for the config UI, so the frontend
    doesn't have to reconstruct parent/child from a flat map."""
    children = {}
    for key, spec in CAPABILITIES.items():
        children.setdefault(spec['parent'], []).append(key)

    def build(parent):
        return [
            {
                'key': key,
                'label': CAPABILITIES[key]['label'],
                'tier': CAPABILITIES[key]['tier'],
                'default_enabled': CAPABILITIES[key]['default_enabled'],
                'settings_schema': CAPABILITIES[key]['settings_schema'],
                'children': build(key),
            }
            for key in children.get(parent, [])
        ]

    return build(None)
