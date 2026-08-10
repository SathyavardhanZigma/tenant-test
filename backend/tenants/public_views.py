from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class TenantPublicInfoView(APIView):
    """Public tenant branding lookup (company name/logo) used by the React
    frontend to render a tenant-branded login page before authentication.
    Exposes only non-sensitive fields — never DB credentials."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, **kwargs):
        tenant = request.tenant
        return Response({
            'company_name': tenant.company_name,
            'slug': tenant.slug,
            'logo_url': tenant.logo.url if tenant.logo else None,
            'features': list(
                tenant.modules.filter(enabled=True).values_list('module_key', flat=True)
            ),
        })
