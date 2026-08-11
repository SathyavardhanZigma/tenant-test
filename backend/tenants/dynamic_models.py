"""Per-tenant Django model classes for Employee/Customer.

schema_sync.py adds real columns to a tenant's table via raw ALTER TABLE, but
the ORM only knows how to SELECT/INSERT/UPDATE fields that are *declared* on
a Model class — it can't discover "whatever columns happen to exist" on its
own. So for every distinct (entity, tenant, field-set) we generate a small
unmanaged Model subclass that declares exactly that tenant's enabled fields,
pointed at the same physical table the static Employee/Customer model (and
schema_sync) already manages. This is what lets normal DRF ModelViewSet/
ModelSerializer code work unmodified even though Tata's table has 8 columns
and Tesla's has 14.

Classes are cached per (entity, tenant slug, sorted field keys) — Django's app
registry doesn't allow re-registering the same model name twice, and the
field set only changes when Superadmin edits TenantFieldConfig, which is rare.
"""

from django.db import models

from modules.customers.models import Customer
from modules.employees.models import Employee

from .dynamic_fields import build_model_field

_STATIC_MODEL = {'employee': Employee, 'customer': Customer}
_APP_LABEL = {'employee': 'employees', 'customer': 'customers'}
_model_cache = {}


def get_dynamic_model(entity, tenant):
    configs = list(
        tenant.field_configs.select_related('field')
        .filter(enabled=True, field__entity=entity)
        .order_by('order')
    )
    field_keys = tuple(cfg.field.field_key for cfg in configs)
    cache_key = (entity, tenant.slug, field_keys)

    cached = _model_cache.get(cache_key)
    if cached is not None:
        return cached

    static_model = _STATIC_MODEL[entity]
    attrs = {
        '__module__': static_model.__module__,
        'code': models.CharField(max_length=64, null=True, blank=True),
        'created_at': models.DateTimeField(auto_now_add=True),
        'updated_at': models.DateTimeField(auto_now=True),
    }
    for cfg in configs:
        attrs[cfg.field.field_key] = build_model_field(cfg.field.data_type)

    attrs['Meta'] = type('Meta', (), {
        'db_table': static_model._meta.db_table,
        'app_label': _APP_LABEL[entity],
        'managed': False,  # schema_sync.py owns real schema changes, not `migrate`
        'ordering': ['id'],  # avoids UnorderedObjectListWarning under DRF pagination
    })

    class_name = f'{static_model.__name__}_{tenant.slug}_{abs(hash(field_keys))}'
    model = type(class_name, (models.Model,), attrs)
    _model_cache[cache_key] = model
    return model
