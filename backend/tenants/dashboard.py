"""Builds the tenant dashboard payload, shaped by that tenant's resolved
capabilities.

The important property for the POC: this function never returns a section the
tenant isn't entitled to. Hiding a widget in React is a convenience; this is
the enforcement. If `dashboard.stats` is off, the response has no `stats` key
at all — so there is no "hidden" data sitting in the JSON for someone to read
out of devtools.

Every count is read through get_dynamic_model so it goes to the tenant's own
database via TenantRouter, and respects the fact that a disabled module's
table may not physically exist.
"""

from django.db import connections

from .capabilities import resolve
from .entities import ENTITY_CODE_PREFIX, ENTITY_TO_MODULE_KEY
from .dynamic_models import get_dynamic_model
from .limits import effective_limit

_ENTITY_LABEL = {'employee': 'Employees', 'customer': 'Customers'}
# dashboard.stats settings_schema key that governs each entity's tile.
_ENTITY_STATS_FLAG = {'employee': 'show_employee_count', 'customer': 'show_customer_count'}
# TenantTableLimit.table_key for each entity.
_ENTITY_TABLE_KEY = {'employee': 'employees', 'customer': 'customers'}


def _enabled_entities(tenant):
    """Entities whose owning module is enabled for this tenant, in a stable
    order so the dashboard doesn't reshuffle between requests."""
    enabled_modules = set(
        tenant.modules.filter(enabled=True).values_list('module_key', flat=True)
    )
    return [
        entity for entity in ('employee', 'customer')
        if ENTITY_TO_MODULE_KEY[entity] in enabled_modules
    ]


def _table_exists(tenant, model):
    """A module that was never selected at onboarding (or was later disabled)
    has its table dropped outright by schema_sync — querying it would raise
    ProgrammingError, so callers check first."""
    connection = connections[tenant.slug]
    with connection.cursor() as cursor:
        return model._meta.db_table in connection.introspection.table_names(cursor)


def build_dashboard(tenant):
    """Assemble the dashboard payload for one tenant."""
    caps = resolve(tenant)
    entities = _enabled_entities(tenant)

    payload = {
        'company_name': tenant.company_name,
        'slug': tenant.slug,
        'tier': tenant.tier,
        'plan': tenant.plan,
    }

    if caps['dashboard.stats']['enabled']:
        payload['stats'] = _build_stats(tenant, entities, caps['dashboard.stats']['settings'])

    if caps['dashboard.recent_activity']['enabled']:
        payload['recent_activity'] = _build_recent_activity(
            tenant, entities, caps['dashboard.recent_activity']['settings'],
        )

    if caps['dashboard.module_shortcuts']['enabled']:
        payload['module_shortcuts'] = _build_shortcuts(
            tenant, entities, caps['dashboard.module_shortcuts']['settings'],
        )

    return payload


def _build_stats(tenant, entities, settings):
    """One tile per enabled entity, gated by its own show_*_count setting, with
    optional usage-against-limit so a trial tenant can see how close it is to
    the 5-record cap."""
    tiles = []
    for entity in entities:
        if not settings.get(_ENTITY_STATS_FLAG[entity], True):
            continue

        model = get_dynamic_model(entity, tenant)
        if not _table_exists(tenant, model):
            continue

        count = model.objects.using(tenant.slug).count()
        tile = {
            'entity': entity,
            'label': _ENTITY_LABEL[entity],
            'count': count,
        }

        if settings.get('show_limit_usage', True):
            limit = effective_limit(tenant, _ENTITY_TABLE_KEY[entity])
            tile['limit'] = limit
            # Percentage is computed here rather than in React so the "how full
            # is this tenant" rule lives in one place alongside effective_limit.
            tile['usage_percent'] = (
                min(100, round(count / limit * 100)) if limit else None
            )

        tiles.append(tile)
    return tiles


def _build_recent_activity(tenant, entities, settings):
    """Most recently created records across the configured source(s), newest
    first. `row_count` is already range-checked by the capability resolver, so
    it's safe to slice with directly."""
    source = settings.get('source', 'both')
    row_count = settings.get('row_count', 5)

    wanted = entities if source == 'both' else [
        e for e in entities if ENTITY_TO_MODULE_KEY[e] == source
    ]

    rows = []
    for entity in wanted:
        model = get_dynamic_model(entity, tenant)
        if not _table_exists(tenant, model):
            continue

        # Pull row_count per entity, then trim after the merge below — the
        # newest N overall can all come from one entity.
        recent = (
            model.objects.using(tenant.slug)
            .order_by('-created_at', '-id')[:row_count]
        )
        for obj in recent:
            rows.append({
                'entity': entity,
                'label': _ENTITY_LABEL[entity],
                'code': getattr(obj, 'code', None) or f'{ENTITY_CODE_PREFIX[entity]}-{obj.id}',
                'title': _describe(obj),
                'created_at': obj.created_at,
            })

    rows.sort(key=lambda r: r['created_at'], reverse=True)
    return rows[:row_count]


def _describe(obj):
    """Best-effort human label for a dynamic record. Field sets differ per
    tenant (that's the point of TenantFieldConfig), so we probe the usual
    name-ish fields in preference order rather than assuming any exist."""
    for attr in ('full_name', 'name', 'first_name', 'company_name', 'email'):
        value = getattr(obj, attr, None)
        if value:
            return str(value)
    return None


def _build_shortcuts(tenant, entities, settings):
    """Navigation cards for the modules this tenant actually has, so the
    dashboard's links can't point at a module whose table was dropped."""
    descriptions = {
        'employee': 'Manage employee records for your company.',
        'customer': 'Manage customer records for your company.',
    }
    return [
        {
            'entity': entity,
            'module_key': ENTITY_TO_MODULE_KEY[entity],
            'label': _ENTITY_LABEL[entity],
            'description': (
                descriptions[entity] if settings.get('show_descriptions', True) else None
            ),
        }
        for entity in entities
    ]
