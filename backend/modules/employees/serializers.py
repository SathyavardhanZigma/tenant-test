from rest_framework import serializers

from core_auth.field_filter import visible_field_keys
from tenants.dynamic_models import get_dynamic_model


def build_dynamic_employee_serializer(tenant, request=None):
    """Builds an Employee serializer whose fields are exactly the tenant's
    enabled TenantFieldConfig rows for entity='employee' — Tata gets 8 fields,
    Tesla gets 14, driven entirely by data rather than per-tenant code.
    Backed by a per-tenant Django model (see tenants.dynamic_models) so
    ModelSerializer derives the correct field type (boolean, integer, date,
    ...) automatically instead of everything being treated as text.

    When request is given, a staff user's StaffModuleGrant/StaffFieldGrant
    (see core_auth.field_filter) further narrows this down to only the
    fields that staff member can see, and makes fields they can view but not
    edit read-only — always within the tenant-wide field set above."""

    model = get_dynamic_model('employee', tenant)
    all_field_keys = {f.name for f in model._meta.get_fields()}

    extra_kwargs = {'code': {'read_only': True}}
    field_names = ['id', 'code', 'created_at', 'updated_at'] + [
        f.name for f in model._meta.get_fields()
        if f.name not in ('id', 'code', 'created_at', 'updated_at')
    ]

    if request is not None:
        viewable, editable = visible_field_keys(request, 'employees', all_field_keys)
        field_names = [name for name in field_names if name in ('id', 'code', 'created_at', 'updated_at') or name in viewable]
        for name in field_names:
            if name not in ('id', 'code') and name not in editable:
                extra_kwargs[name] = {'read_only': True}

    return type(
        'DynamicEmployeeSerializer',
        (serializers.ModelSerializer,),
        {'Meta': type('Meta', (), {
            'model': model, 'fields': field_names,
            'extra_kwargs': extra_kwargs,
        })},
    )
