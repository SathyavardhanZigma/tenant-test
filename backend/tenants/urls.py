from rest_framework.routers import DefaultRouter

from .views import FeatureViewSet, FieldCatalogViewSet, PlanViewSet, TenantViewSet

router = DefaultRouter()
router.register('tenants', TenantViewSet, basename='tenant')
router.register('field-catalog', FieldCatalogViewSet, basename='field-catalog')
router.register('features', FeatureViewSet, basename='feature')
router.register('plans', PlanViewSet, basename='plan')

urlpatterns = router.urls
