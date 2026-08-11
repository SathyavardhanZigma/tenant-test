from rest_framework import filters, viewsets

from ..models import FieldCatalog
from ..serializers import FieldCatalogSerializer
from .permissions import IsSuperAdmin


class FieldCatalogViewSet(viewsets.ModelViewSet):
    """Superadmin-managed master field list (e.g. the 14 possible Employee fields)."""

    queryset = FieldCatalog.objects.all().order_by('entity', 'field_key')
    serializer_class = FieldCatalogSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [filters.SearchFilter]
    search_fields = ['field_key', 'label']
