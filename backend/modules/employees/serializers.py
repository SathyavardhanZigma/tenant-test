from rest_framework import serializers

from tenants.dynamic_models import get_dynamic_model


def build_dynamic_employee_serializer(tenant):
    """Builds an Employee serializer whose fields are exactly the tenant's
    enabled TenantFieldConfig rows for entity='employee' — Tata gets 8 fields,
    Tesla gets 14, driven entirely by data rather than per-tenant code.
    Backed by a per-tenant Django model (see tenants.dynamic_models) so
    ModelSerializer derives the correct field type (boolean, integer, date,
    ...) automatically instead of everything being treated as text."""

    model = get_dynamic_model('employee', tenant)

    return type(
        'DynamicEmployeeSerializer',
        (serializers.ModelSerializer,),
        {'Meta': type('Meta', (), {
            'model': model, 'fields': '__all__',
            'extra_kwargs': {'code': {'read_only': True}},
        })},
    )
