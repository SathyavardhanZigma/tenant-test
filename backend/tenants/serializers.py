from rest_framework import serializers

from .features import active_feature_keys
from .models import Feature, FieldCatalog, Plan, Tenant, TenantModule


class FeatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feature
        fields = ['id', 'key', 'label', 'description', 'entity', 'is_active', 'sort_order']


class PlanSerializer(serializers.ModelSerializer):
    feature_keys = serializers.SerializerMethodField()

    class Meta:
        model = Plan
        fields = ['id', 'key', 'name', 'description', 'feature_keys', 'is_active', 'sort_order']

    def get_feature_keys(self, obj):
        return list(obj.features.filter(is_active=True).values_list('key', flat=True))


class TenantModuleSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    entity = serializers.SerializerMethodField()

    class Meta:
        model = TenantModule
        fields = ['id', 'module_key', 'label', 'description', 'entity', 'enabled']

    def get_label(self, obj):
        if obj.feature_id:
            return obj.feature.label
        return obj.module_key.replace('_', ' ').title()

    def get_description(self, obj):
        return obj.feature.description if obj.feature_id else ''

    def get_entity(self, obj):
        return obj.feature.entity if obj.feature_id else None


class FieldCatalogSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldCatalog
        fields = ['id', 'entity', 'field_key', 'label', 'data_type', 'options', 'is_required_default']


class TenantSerializer(serializers.ModelSerializer):
    modules = TenantModuleSerializer(many=True, read_only=True)
    plan_key = serializers.SerializerMethodField()
    plan_name = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            'id', 'company_name', 'slug', 'owner_name', 'owner_email', 'owner_phone',
            'logo', 'status', 'plan_key', 'plan_name', 'modules', 'created_at',
        ]
        read_only_fields = ['status', 'created_at']

    def get_plan_key(self, obj):
        subscription = getattr(obj, 'subscription', None)
        return subscription.plan.key if subscription and subscription.plan_id else None

    def get_plan_name(self, obj):
        subscription = getattr(obj, 'subscription', None)
        return subscription.plan.name if subscription and subscription.plan_id else 'Custom'


class TenantOnboardingSerializer(serializers.Serializer):
    """Backs the configuration form: company details + module selections."""

    company_name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=100)
    owner_name = serializers.CharField(max_length=255)
    owner_email = serializers.EmailField()
    owner_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    logo = serializers.ImageField(required=False, allow_null=True)
    module_keys = serializers.ListField(child=serializers.SlugField(), required=False)
    plan_key = serializers.SlugField(required=False, allow_blank=True)

    def validate_module_keys(self, value):
        invalid = sorted(set(value) - active_feature_keys())
        if invalid:
            raise serializers.ValidationError(f'Unknown feature option(s): {", ".join(invalid)}')
        return list(dict.fromkeys(value))

    def validate_plan_key(self, value):
        if not value:
            return ''
        if not Plan.objects.filter(key=value, is_active=True).exists():
            raise serializers.ValidationError('Unknown subscription plan.')
        return value

    def validate_slug(self, value):
        if Tenant.objects.filter(slug=value).exists():
            raise serializers.ValidationError('A company with this URL slug already exists.')
        return value
