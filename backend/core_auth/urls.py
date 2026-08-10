from django.urls import path

from .views import SuperAdminLoginView

urlpatterns = [
    path('superadmin/login/', SuperAdminLoginView.as_view(), name='superadmin-login'),
]
