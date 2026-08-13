"""Staff module/field permission tests.

This platform provisions one real physical MySQL database per company (see
ARCHITECTURE.md) — TenantRouter, dynamic_models, and schema_sync all depend
on that real database existing, so a mocked/sqlite DB would not exercise the
actual code path these tests need to verify. This test class provisions one
real, uniquely-named tenant database (against the same server as `default`,
see .env) for its whole run and drops it in tearDownClass; each test method
reseeds the tenant's registry rows and staff/user rows in setUp() since
TransactionTestCase truncates them after every test."""

import types
import uuid

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.db import connection as default_connection
from django.db import connections
from django.test import TransactionTestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tenants.db_registry import register_tenant_database
from tenants.models import FieldCatalog, Tenant, TenantFieldConfig, TenantModule
from tenants.provisioning import create_tenant_record, run_tenant_provisioning
from tenants.schema_sync import sync_tenant_schema

from .models import StaffProfile


class StaffPermissionTestCase(TransactionTestCase):
    """TransactionTestCase truncates every table in `databases` after each
    test method, including our tenant's own physical DB and the central
    'default' Tenant/FieldCatalog registry rows — so all fixture data is
    (re)created in setUp(), not setUpClass()/setUpTestData(), and only the
    one-time, expensive bits (physical CREATE DATABASE, migrate) are safe to
    repeat per test since they're idempotent (see tenants.provisioning)."""

    @classmethod
    def setUpClass(cls):
        cls.slug = f'permtest{uuid.uuid4().hex[:8]}'
        cls.databases = frozenset({'default', cls.slug})
        # Django validates that every alias in `databases` already exists in
        # settings.DATABASES as soon as super().setUpClass() runs — before
        # setUp() gets a chance to provision the real tenant DB (see
        # tenants.provisioning.create_tenant_record) — so register the alias
        # config up front, using the same defaults create_tenant_record uses.
        register_tenant_database(types.SimpleNamespace(
            slug=cls.slug,
            db_name=f'tenant_{cls.slug}',
            db_host='localhost',
            db_port='3306',
            db_user=settings.DATABASES['default'].get('USER', ''),
            db_password=settings.DATABASES['default'].get('PASSWORD', ''),
        ))
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        # By now the last test's automatic post-teardown flush has already
        # emptied 'default' (so the Tenant row may be gone already) — drop
        # the physical database directly rather than via drop_tenant_database
        # (which needs a live Tenant instance).
        if cls.slug in connections.databases:
            connections[cls.slug].close()
        with default_connection.cursor() as cursor:
            cursor.execute(f'DROP DATABASE IF EXISTS `tenant_{cls.slug}`')
        connections.databases.pop(cls.slug, None)
        settings.DATABASES.pop(cls.slug, None)

    def setUp(self):
        self.tenant = create_tenant_record(
            company_name='Permission Test Co',
            slug=self.slug,
            owner_name='Owner',
            owner_email='owner@example.com',
            module_keys=['employees', 'customers'],
            plan=Tenant.PLAN_ENTERPRISE,  # Basic plan is read-only for all tenant users; these tests need writes.
        )
        run_tenant_provisioning(self.tenant.id)
        self.tenant.refresh_from_db()

        self.salary_field, _ = FieldCatalog.objects.get_or_create(
            entity='employee', field_key='salary',
            defaults={'label': 'Salary', 'data_type': 'integer'},
        )
        self.name_field, _ = FieldCatalog.objects.get_or_create(
            entity='employee', field_key='full_name',
            defaults={'label': 'Full Name', 'data_type': 'string'},
        )
        TenantFieldConfig.objects.create(tenant=self.tenant, field=self.salary_field, enabled=True, order=0)
        TenantFieldConfig.objects.create(tenant=self.tenant, field=self.name_field, enabled=True, order=1)
        sync_tenant_schema(self.tenant)

        # Owner + a staff user, both real rows in the tenant's own auth_user table.
        self.owner_user = User.objects.using(self.slug).create(username='owner1', password=make_password('pw12345678'))
        StaffProfile.objects.using(self.slug).create(user=self.owner_user, role=StaffProfile.ROLE_OWNER)

        self.staff_user = User.objects.using(self.slug).create(username='staff1', password=make_password('pw12345678'))
        StaffProfile.objects.using(self.slug).create(user=self.staff_user, role=StaffProfile.ROLE_STAFF)

    def _client_for(self, user, staff_role):
        refresh = RefreshToken.for_user(user)
        refresh['tenant_slug'] = self.slug
        refresh['role'] = 'tenant_user'
        refresh['staff_role'] = staff_role
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        return client

    def owner_client(self):
        return self._client_for(self.owner_user, StaffProfile.ROLE_OWNER)

    def staff_client(self):
        return self._client_for(self.staff_user, StaffProfile.ROLE_STAFF)

    def grant_staff(self, module_key, can_view=True, can_edit=False, fields=None):
        response = self.owner_client().post(
            f'/api/{self.slug}/auth/staff/staff1/permissions/',
            [{
                'module_key': module_key,
                'can_view': can_view,
                'can_edit': can_edit,
                'fields': fields or [],
            }],
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

    # --- owner sees everything enabled for the company ---

    def test_owner_sees_all_enabled_fields(self):
        create = self.owner_client().post(
            f'/api/{self.slug}/employees/',
            {'salary': 1000, 'full_name': 'Alice'},
            format='json',
        )
        self.assertEqual(create.status_code, 201, create.data)
        self.assertIn('salary', create.data)
        self.assertIn('full_name', create.data)

    # --- staff sees only granted modules/fields ---

    def test_staff_without_any_grant_is_forbidden(self):
        response = self.staff_client().get(f'/api/{self.slug}/employees/')
        self.assertEqual(response.status_code, 403)

    def test_staff_sees_only_granted_fields(self):
        created = self.owner_client().post(
            f'/api/{self.slug}/employees/',
            {'salary': 5000, 'full_name': 'Bob'},
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        employee_id = created.data['id']

        self.grant_staff(
            'employees', can_view=True, can_edit=False,
            fields=[{'field_key': 'full_name', 'can_view': True, 'can_edit': False}],
        )

        detail = self.staff_client().get(f'/api/{self.slug}/employees/{employee_id}/')
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertIn('full_name', detail.data)
        self.assertNotIn('salary', detail.data)

    def test_staff_schema_matches_field_grants(self):
        """GET .../employees/schema/ drives the frontend's dynamic form/table
        (see EntityManager.jsx) — it must be filtered the same way the actual
        CRUD serializer is, or staff would see a column/input for a field
        they can't actually read or write."""
        self.grant_staff(
            'employees', can_view=True, can_edit=False,
            fields=[{'field_key': 'full_name', 'can_view': True, 'can_edit': False}],
        )

        schema = self.staff_client().get(f'/api/{self.slug}/employees/schema/')
        self.assertEqual(schema.status_code, 200, schema.data)
        keys = {field['key'] for field in schema.data}
        self.assertIn('full_name', keys)
        self.assertNotIn('salary', keys)

        owner_schema = self.owner_client().get(f'/api/{self.slug}/employees/schema/')
        self.assertEqual({f['key'] for f in owner_schema.data}, {'code', 'salary', 'full_name'})

    def test_staff_cannot_edit_view_only_field(self):
        created = self.owner_client().post(
            f'/api/{self.slug}/employees/',
            {'salary': 5000, 'full_name': 'Carol'},
            format='json',
        )
        employee_id = created.data['id']

        self.grant_staff(
            'employees', can_view=True, can_edit=True,
            fields=[{'field_key': 'full_name', 'can_view': True, 'can_edit': False}],
        )

        patch = self.staff_client().patch(
            f'/api/{self.slug}/employees/{employee_id}/', {'full_name': 'Changed'}, format='json',
        )
        self.assertEqual(patch.status_code, 200, patch.data)
        self.assertEqual(patch.data['full_name'], 'Carol')  # read-only field: input silently ignored

    # --- staff cannot be granted a module/field the company itself doesn't have ---

    def test_cannot_grant_disabled_module(self):
        response = self.owner_client().post(
            f'/api/{self.slug}/auth/staff/staff1/permissions/',
            [{'module_key': 'not-a-real-module', 'can_view': True, 'can_edit': False, 'fields': []}],
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_cannot_grant_field_outside_catalog(self):
        response = self.owner_client().post(
            f'/api/{self.slug}/auth/staff/staff1/permissions/',
            [{
                'module_key': 'employees', 'can_view': True, 'can_edit': False,
                'fields': [{'field_key': 'ssn', 'can_view': True, 'can_edit': False}],
            }],
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    # --- a disabled TenantModule/TenantFieldConfig immediately blocks staff
    #     access even if a grant row still exists ---

    def test_disabling_module_blocks_staff_despite_existing_grant(self):
        self.grant_staff('customers', can_view=True, can_edit=False)
        ok = self.staff_client().get(f'/api/{self.slug}/customers/')
        self.assertEqual(ok.status_code, 200, ok.data)

        TenantModule.objects.using('default').filter(tenant=self.tenant, module_key='customers').update(enabled=False)

        blocked = self.staff_client().get(f'/api/{self.slug}/customers/')
        self.assertEqual(blocked.status_code, 403)

    # --- owner-only management endpoints reject staff ---

    def test_staff_cannot_manage_permissions(self):
        response = self.staff_client().get(f'/api/{self.slug}/auth/entitlements/')
        self.assertEqual(response.status_code, 403)

        response = self.staff_client().post(
            f'/api/{self.slug}/auth/staff/staff1/permissions/',
            [{'module_key': 'employees', 'can_view': True, 'can_edit': True, 'fields': []}],
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_owner_can_read_entitlements(self):
        response = self.owner_client().get(f'/api/{self.slug}/auth/entitlements/')
        self.assertEqual(response.status_code, 200)
        module_keys = {m['module_key'] for m in response.data}
        self.assertEqual(module_keys, {'employees', 'customers'})

    def test_owner_can_list_staff_staff_cannot(self):
        response = self.owner_client().get(f'/api/{self.slug}/auth/staff/')
        self.assertEqual(response.status_code, 200, response.data)
        by_username = {u['username']: u['role'] for u in response.data}
        self.assertEqual(by_username, {'owner1': 'owner', 'staff1': 'staff'})

        response = self.staff_client().get(f'/api/{self.slug}/auth/staff/')
        self.assertEqual(response.status_code, 403)

    # --- Roles is a Superadmin-toggleable module, like Employees/Customers ---

    def test_roles_disabled_by_default_for_new_tenant(self):
        # setUp() only enables 'employees'/'customers' for this test tenant —
        # 'roles' must be off by default, same as any other module a company
        # hasn't been given.
        response = self.owner_client().get(f'/api/{self.slug}/roles/')
        self.assertEqual(response.status_code, 403)

    def test_owner_can_manage_roles_once_module_enabled(self):
        TenantModule.objects.using('default').update_or_create(
            tenant=self.tenant, module_key='roles', defaults={'enabled': True},
        )
        role_field, _ = FieldCatalog.objects.get_or_create(
            entity='employee', field_key='role', defaults={'label': 'Role', 'data_type': 'role'},
        )
        TenantFieldConfig.objects.create(tenant=self.tenant, field=role_field, enabled=True, order=2)

        create = self.owner_client().post(f'/api/{self.slug}/roles/', {'name': 'QA Engineer'}, format='json')
        self.assertEqual(create.status_code, 201, create.data)

        listing = self.owner_client().get(f'/api/{self.slug}/roles/')
        self.assertEqual(listing.status_code, 200)
        self.assertIn('QA Engineer', [r['name'] for r in listing.data['results']])

        schema = self.owner_client().get(f'/api/{self.slug}/employees/schema/')
        role_schema_field = next(f for f in schema.data if f['key'] == 'role')
        self.assertIn('QA Engineer', role_schema_field['options'])

    def test_staff_can_view_but_not_manage_roles(self):
        TenantModule.objects.using('default').update_or_create(
            tenant=self.tenant, module_key='roles', defaults={'enabled': True},
        )
        self.grant_staff('roles', can_view=True, can_edit=False)

        listing = self.staff_client().get(f'/api/{self.slug}/roles/')
        self.assertEqual(listing.status_code, 200, listing.data)

        create = self.staff_client().post(f'/api/{self.slug}/roles/', {'name': 'Intern'}, format='json')
        self.assertEqual(create.status_code, 403)

    def test_disabling_roles_module_blocks_owner_too(self):
        TenantModule.objects.using('default').update_or_create(
            tenant=self.tenant, module_key='roles', defaults={'enabled': True},
        )
        ok = self.owner_client().get(f'/api/{self.slug}/roles/')
        self.assertEqual(ok.status_code, 200)

        TenantModule.objects.using('default').filter(tenant=self.tenant, module_key='roles').update(enabled=False)

        blocked_read = self.owner_client().get(f'/api/{self.slug}/roles/')
        self.assertEqual(blocked_read.status_code, 403)
        blocked_write = self.owner_client().post(f'/api/{self.slug}/roles/', {'name': 'Anything'}, format='json')
        self.assertEqual(blocked_write.status_code, 403)
