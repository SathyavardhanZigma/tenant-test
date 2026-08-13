from rest_framework import serializers

from core_auth.field_filter import visible_field_keys
from tenants.dynamic_models import get_dynamic_model


def build_dynamic_customer_serializer(tenant, request=None):
    """Mirrors employees.serializers.build_dynamic_employee_serializer
    (including staff field-grant filtering when request is given), but for
    entity='customer' catalog fields."""

    model = get_dynamic_model('customer', tenant)
    all_field_keys = {f.name for f in model._meta.get_fields()}

    extra_kwargs = {'code': {'read_only': True}}
    field_names = ['id', 'code', 'created_at', 'updated_at'] + [
        f.name for f in model._meta.get_fields()
        if f.name not in ('id', 'code', 'created_at', 'updated_at')
    ]

    if request is not None:
        viewable, editable = visible_field_keys(request, 'customers', all_field_keys)
        field_names = [name for name in field_names if name in ('id', 'code', 'created_at', 'updated_at') or name in viewable]
        for name in field_names:
            if name not in ('id', 'code') and name not in editable:
                extra_kwargs[name] = {'read_only': True}

    return type(
        'DynamicCustomerSerializer',
        (serializers.ModelSerializer,),
        {'Meta': type('Meta', (), {
            'model': model, 'fields': field_names,
            'extra_kwargs': extra_kwargs,
        })},
    )
