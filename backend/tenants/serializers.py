from rest_framework import serializers

from .models import FieldCatalog, Tenant, TenantModule


class TenantModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantModule
        fields = ['id', 'module_key', 'enabled']


class FieldCatalogSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldCatalog
        fields = ['id', 'entity', 'field_key', 'label', 'data_type', 'options', 'is_required_default']


class TenantSerializer(serializers.ModelSerializer):
    modules = TenantModuleSerializer(many=True, read_only=True)

    class Meta:
        model = Tenant
        fields = [
            'id', 'company_name', 'slug', 'owner_name', 'owner_email', 'owner_phone',
            'logo', 'status', 'modules', 'created_at',
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

    def validate_slug(self, value):
        if Tenant.objects.filter(slug=value).exists():
            raise serializers.ValidationError('A company with this URL slug already exists.')
        return value
