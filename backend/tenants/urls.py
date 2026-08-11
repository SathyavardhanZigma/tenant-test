from rest_framework.routers import DefaultRouter

from .views import FieldCatalogViewSet, TenantViewSet

router = DefaultRouter()
router.register('tenants', TenantViewSet, basename='tenant')
router.register('field-catalog', FieldCatalogViewSet, basename='field-catalog')

urlpatterns = router.urls
