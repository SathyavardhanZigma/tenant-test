from rest_framework import serializers

from tenants.dynamic_models import get_dynamic_model


def build_dynamic_customer_serializer(tenant):
    """Mirrors employees.serializers.build_dynamic_employee_serializer, but for
    entity='customer' catalog fields."""

    model = get_dynamic_model('customer', tenant)

    return type(
        'DynamicCustomerSerializer',
        (serializers.ModelSerializer,),
        {'Meta': type('Meta', (), {
            'model': model, 'fields': '__all__',
            'extra_kwargs': {'code': {'read_only': True}},
        })},
    )
