from rest_framework import serializers

from ..models import TenantTableLimit


class TenantTableLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantTableLimit
        fields = ['id', 'table_key', 'max_records']
