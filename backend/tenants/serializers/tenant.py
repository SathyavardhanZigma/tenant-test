from rest_framework import serializers

from ..entities import MODULE_CHOICES
from ..models import Tenant, TenantModule

MODULE_LABELS = dict(MODULE_CHOICES)


class TenantModuleSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()

    class Meta:
        model = TenantModule
        fields = ['id', 'module_key', 'label', 'enabled']

    def get_label(self, obj):
        return MODULE_LABELS.get(obj.module_key, obj.module_key.title())


class TenantSerializer(serializers.ModelSerializer):
    modules = TenantModuleSerializer(many=True, read_only=True)

    class Meta:
        model = Tenant
        fields = [
            'id', 'company_name', 'slug', 'owner_name', 'owner_email', 'owner_phone',
            'logo', 'status', 'tier', 'plan', 'modules', 'created_at',
        ]
        read_only_fields = ['status', 'created_at']


class TenantOnboardingSerializer(serializers.Serializer):
    """Backs the configuration form: company details + module selections."""

    company_name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=100)
    owner_name = serializers.CharField(max_length=255)
    owner_email = serializers.EmailField()
    owner_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    logo = serializers.ImageField(required=False, allow_null=True)
    module_keys = serializers.ListField(child=serializers.SlugField(), required=False)
    tier = serializers.ChoiceField(choices=Tenant.TIER_CHOICES, required=False, default=Tenant.TIER_TRIAL)
    plan = serializers.ChoiceField(choices=Tenant.PLAN_CHOICES, required=False, default=Tenant.PLAN_BASIC)

    def validate_module_keys(self, value):
        valid_keys = {key for key, _ in MODULE_CHOICES}
        invalid = sorted(set(value) - valid_keys)
        if invalid:
            raise serializers.ValidationError(f'Unknown module(s): {", ".join(invalid)}')
        return list(dict.fromkeys(value))

    def validate_slug(self, value):
        if Tenant.objects.filter(slug=value).exists():
            raise serializers.ValidationError('A company with this URL slug already exists.')
        return value
