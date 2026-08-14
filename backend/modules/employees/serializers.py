from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers

from core_auth.field_filter import visible_field_keys
from core_auth.models import StaffProfile
from tenants.dynamic_models import get_dynamic_model

# Fixed, non-catalog columns every dynamic Employee model carries (see
# tenants.dynamic_models.get_dynamic_model) — never filtered by
# StaffFieldGrant, never part of the tenant's configurable field set.
_FIXED_FIELDS = ('id', 'code', 'created_at', 'updated_at')


def _create_login(tenant, instance, username, password):
    if User.objects.using(tenant.slug).filter(username=username).exists():
        raise serializers.ValidationError({'login_username': 'That username already exists for this company.'})
    if len(password) < 8:
        raise serializers.ValidationError({'login_password': 'Password must be at least 8 characters.'})

    user = User.objects.using(tenant.slug).create(username=username, password=make_password(password))
    StaffProfile.objects.using(tenant.slug).create(user=user, role=StaffProfile.ROLE_STAFF)
    instance.user = user
    instance.save(using=tenant.slug, update_fields=['user'])


def _update_login(tenant, instance, username, password):
    user = instance.user
    if username and username != user.username:
        if User.objects.using(tenant.slug).filter(username=username).exclude(pk=user.pk).exists():
            raise serializers.ValidationError({'login_username': 'That username already exists for this company.'})
        user.username = username
    if password:
        if len(password) < 8:
            raise serializers.ValidationError({'login_password': 'Password must be at least 8 characters.'})
        user.password = make_password(password)
    user.save(using=tenant.slug)


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
    edit read-only — always within the tenant-wide field set above.

    Also exposes an optional login on top of the model's own dynamic fields:
    `username` (read-only, this employee's login if any), and write-only
    `login_username`/`login_password` to attach a new login (create) or
    rename/reset an existing one (update) — a plain username/password pair
    directly in this tenant's own auth_user table (see
    core_auth.models.StaffProfile), same as any other staff account. Once
    attached, the owner manages that login's module/field permissions the
    normal way, via /api/<tenant>/auth/staff/<username>/permissions/."""

    model = get_dynamic_model('employee', tenant)
    all_field_keys = {f.name for f in model._meta.get_fields() if f.name != 'user'}

    extra_kwargs = {'code': {'read_only': True}}
    field_names = list(_FIXED_FIELDS) + [
        f.name for f in model._meta.get_fields()
        if f.name not in _FIXED_FIELDS and f.name != 'user'
    ]

    if request is not None:
        viewable, editable = visible_field_keys(request, 'employees', all_field_keys)
        field_names = [name for name in field_names if name in _FIXED_FIELDS or name in viewable]
        for name in field_names:
            if name not in ('id', 'code') and name not in editable:
                extra_kwargs[name] = {'read_only': True}

    field_names = field_names + ['username', 'login_username', 'login_password']

    def get_username(self, obj):
        return obj.user.username if obj.user_id else None

    def create(self, validated_data):
        login_username = validated_data.pop('login_username', '')
        login_password = validated_data.pop('login_password', '')
        instance = super(serializer_class, self).create(validated_data)
        if login_username or login_password:
            if not (login_username and login_password):
                raise serializers.ValidationError(
                    {'login_username': 'Both a username and a password are required to create a login.'},
                )
            with transaction.atomic(using=tenant.slug):
                _create_login(tenant, instance, login_username, login_password)
        return instance

    def update(self, instance, validated_data):
        login_username = validated_data.pop('login_username', '')
        login_password = validated_data.pop('login_password', '')
        instance = super(serializer_class, self).update(instance, validated_data)
        if login_username or login_password:
            with transaction.atomic(using=tenant.slug):
                if instance.user_id:
                    _update_login(tenant, instance, login_username, login_password)
                elif login_username and login_password:
                    _create_login(tenant, instance, login_username, login_password)
                else:
                    raise serializers.ValidationError(
                        {'login_username': 'Both a username and a password are required to create a login.'},
                    )
        return instance

    serializer_class = type(
        'DynamicEmployeeSerializer',
        (serializers.ModelSerializer,),
        {
            'Meta': type('Meta', (), {
                'model': model, 'fields': field_names,
                'extra_kwargs': extra_kwargs,
            }),
            'username': serializers.SerializerMethodField(),
            'get_username': get_username,
            'login_username': serializers.CharField(write_only=True, required=False, allow_blank=True),
            'login_password': serializers.CharField(write_only=True, required=False, allow_blank=True),
            'create': create,
            'update': update,
        },
    )
    return serializer_class
