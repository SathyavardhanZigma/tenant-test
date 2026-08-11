from rest_framework import serializers

from ..models import FieldCatalog


class FieldCatalogSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldCatalog
        fields = ['id', 'entity', 'field_key', 'label', 'data_type', 'options', 'is_required_default']
