from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import SuperAdminLoginSerializer, TenantLoginSerializer


class SuperAdminLoginView(APIView):
    """Backs the /__superadmin frontend route. Central-DB auth only —
    exempted from TenantResolverMiddleware."""

    # Skip DRF's default authentication classes (JWTAuthentication) entirely —
    # otherwise a stale/expired Bearer token left over from a previous session
    # makes DRF reject the request before permission_classes is even checked,
    # even though this endpoint is meant to be reachable by anyone.
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SuperAdminLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        admin = serializer.validated_data['admin']

        refresh = RefreshToken()
        refresh['username'] = admin.username
        refresh['role'] = 'superadmin'
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'username': admin.username,
        })


class TenantLoginView(APIView):
    """Backs /<company-slug>/login. Authenticates against the tenant DB that
    TenantResolverMiddleware already resolved onto request.tenant."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, **kwargs):
        serializer = TenantLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            request,
            username=serializer.validated_data['username'],
            password=serializer.validated_data['password'],
        )
        if user is None:
            return Response({'detail': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        refresh['tenant_slug'] = request.tenant.slug
        refresh['role'] = 'tenant_user'
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'tenant': request.tenant.slug,
        })
