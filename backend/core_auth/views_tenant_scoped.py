"""Owner-facing staff-permission management, mounted at
/api/<tenant_slug>/auth/ in config/urls.py. A company's owner uses this to
see what the company itself is entitled to (superadmin's TenantModule/
TenantFieldConfig selections) and to decide which of that a given staff
user can see/edit — see core_auth.models.StaffModuleGrant/StaffFieldGrant."""

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from tenants.entities import ENTITY_TO_MODULE_KEY, MODULE_CHOICES

from .models import StaffFieldGrant, StaffModuleGrant, StaffProfile
from .permissions import IsTenantOwner


def _company_entitlements(tenant):
    """This company's own enabled modules and fields — the ceiling an owner
    can grant staff within, sourced from Superadmin's TenantModule/
    TenantFieldConfig selections."""
    enabled_modules = tenant.modules.filter(enabled=True)
    field_configs = tenant.field_configs.select_related('field').filter(enabled=True)

    fields_by_entity = {}
    for cfg in field_configs:
        fields_by_entity.setdefault(cfg.field.entity, []).append({
            'field_key': cfg.field.field_key,
            'label': cfg.field.label,
            'data_type': cfg.field.data_type,
        })

    module_labels = dict(MODULE_CHOICES)
    return [
        {
            'module_key': m.module_key,
            'label': module_labels.get(m.module_key, m.module_key.title()),
            'fields': fields_by_entity.get(
                next((e for e, mk in ENTITY_TO_MODULE_KEY.items() if mk == m.module_key), None), [],
            ),
        }
        for m in enabled_modules
    ]


class TenantEntitlementsView(APIView):
    """GET: this company's own enabled modules and fields (read-only here;
    only Superadmin edits those — see tenants.views.tenant.TenantViewSet)."""

    permission_classes = [IsTenantOwner]

    def get(self, request, **kwargs):
        return Response(_company_entitlements(request.tenant))


class StaffListView(APIView):
    """GET: every login user in this tenant's own database, with role — lets
    an owner pick who to grant module/field permissions to. Owners can't
    reach Superadmin's user-registry endpoint (/api/superadmin/tenants/<id>/
    users/), so this is the only way an owner can see their own company's
    staff usernames.

    POST: an owner creates a new staff login directly in their own tenant DB,
    without needing Superadmin. Always role=staff — the owner account itself
    is only ever created by Superadmin (the tenant's first user, see
    tenants.views.tenant.TenantViewSet.users). A freshly created staff user
    has no module/field grants yet; the owner sets those via
    StaffPermissionView afterwards."""

    permission_classes = [IsTenantOwner]

    def get(self, request, **kwargs):
        tenant = request.tenant
        users = User.objects.using(tenant.slug).select_related('staff_profile')
        return Response([
            {
                'username': u.username,
                'role': u.staff_profile.role if hasattr(u, 'staff_profile') else StaffProfile.ROLE_OWNER,
            }
            for u in users
        ])

    def post(self, request, **kwargs):
        tenant = request.tenant
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')
        if not username or not password:
            return Response({'detail': 'username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 8:
            return Response({'detail': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.using(tenant.slug).filter(username=username).exists():
            return Response({'detail': 'That username already exists for this company.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.using(tenant.slug).create(username=username, password=make_password(password))
        StaffProfile.objects.using(tenant.slug).create(user=user, role=StaffProfile.ROLE_STAFF)
        return Response({'username': username, 'role': StaffProfile.ROLE_STAFF}, status=status.HTTP_201_CREATED)


class StaffPermissionView(APIView):
    """GET /staff/<username>/permissions/: the given staff user's current
    module/field grants (owners implicitly have full access and always
    return every entitlement as fully granted).
    POST: replace that staff user's grants wholesale — body:
    [{"module_key": "employees", "can_view": true, "can_edit": false,
      "fields": [{"field_key": "salary", "can_view": true, "can_edit": false}]}]
    Granting a module/field outside the company's own entitlements
    (TenantEntitlementsView) is rejected — the company can only narrow what
    Superadmin has already enabled, never widen it."""

    permission_classes = [IsTenantOwner]

    def _get_profile(self, request, username):
        tenant = request.tenant
        user = get_object_or_404(User.objects.using(tenant.slug), username=username)
        profile, _ = StaffProfile.objects.using(tenant.slug).get_or_create(user=user)
        return profile

    def get(self, request, username, **kwargs):
        tenant = request.tenant
        profile = self._get_profile(request, username)

        if profile.role == StaffProfile.ROLE_OWNER:
            entitlements = _company_entitlements(tenant)
            return Response([
                {
                    'module_key': m['module_key'],
                    'can_view': True,
                    'can_edit': True,
                    'fields': [{**f, 'can_view': True, 'can_edit': True} for f in m['fields']],
                }
                for m in entitlements
            ])

        grants = StaffModuleGrant.objects.using(tenant.slug).filter(profile=profile).prefetch_related('field_grants')
        return Response([
            {
                'module_key': g.module_key,
                'can_view': g.can_view,
                'can_edit': g.can_edit,
                'fields': [
                    {'field_key': fg.field_key, 'can_view': fg.can_view, 'can_edit': fg.can_edit}
                    for fg in g.field_grants.all()
                ],
            }
            for g in grants
        ])

    def post(self, request, username, **kwargs):
        tenant = request.tenant
        profile = self._get_profile(request, username)

        if profile.role == StaffProfile.ROLE_OWNER:
            return Response(
                {'detail': 'This user is the company owner and already has full access.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        enabled_module_keys = set(tenant.modules.filter(enabled=True).values_list('module_key', flat=True))
        enabled_fields_by_module = {}
        for cfg in tenant.field_configs.select_related('field').filter(enabled=True):
            module_key = ENTITY_TO_MODULE_KEY.get(cfg.field.entity)
            enabled_fields_by_module.setdefault(module_key, set()).add(cfg.field.field_key)

        for row in request.data:
            module_key = row.get('module_key')
            if module_key not in enabled_module_keys:
                return Response(
                    {'detail': f'"{module_key}" is not enabled for this company.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            allowed_fields = enabled_fields_by_module.get(module_key, set())
            requested_fields = row.get('fields', [])
            for field_row in requested_fields:
                if field_row.get('field_key') not in allowed_fields:
                    return Response(
                        {'detail': f'"{field_row.get("field_key")}" is not enabled for this company\'s "{module_key}" module.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            grant, _ = StaffModuleGrant.objects.using(tenant.slug).update_or_create(
                profile=profile, module_key=module_key,
                defaults={
                    'can_view': row.get('can_view', True),
                    'can_edit': row.get('can_edit', False),
                },
            )

            StaffFieldGrant.objects.using(tenant.slug).filter(module_grant=grant).delete()
            StaffFieldGrant.objects.using(tenant.slug).bulk_create([
                StaffFieldGrant(
                    module_grant=grant,
                    field_key=field_row['field_key'],
                    can_view=field_row.get('can_view', True),
                    can_edit=field_row.get('can_edit', False),
                )
                for field_row in requested_fields
            ])

        return Response({'detail': 'Staff permissions updated.'})
