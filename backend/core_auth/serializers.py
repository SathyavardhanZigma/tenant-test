from django.contrib.auth.hashers import check_password
from rest_framework import serializers

from tenants.models import SuperAdminUser

from .models import Role


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ['id', 'name']


class SuperAdminLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        try:
            admin = SuperAdminUser.objects.get(username=attrs['username'], is_active=True)
        except SuperAdminUser.DoesNotExist:
            raise serializers.ValidationError('Invalid credentials.')

        if not check_password(attrs['password'], admin.password_hash):
            raise serializers.ValidationError('Invalid credentials.')

        attrs['admin'] = admin
        return attrs


class TenantLoginSerializer(serializers.Serializer):
    """Authenticates a user against the tenant DB resolved by
    TenantResolverMiddleware (request.tenant)."""

    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
