from rest_framework.routers import DefaultRouter

from .views_roles import RoleViewSet

router = DefaultRouter()
router.register('roles', RoleViewSet, basename='role')

urlpatterns = router.urls
