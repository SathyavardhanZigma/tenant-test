"""Tests for the capability resolver — the rules a reviewer will want proof of.

Deliberately hits resolve() directly rather than through HTTP: the resolver is
where the product rules live (cascade, lock tiers, settings validation), and
testing it in isolation keeps these from turning into slow API tests that also
need a provisioned tenant database.
"""

from django.test import TestCase

from .capabilities import CAPABILITIES, TIER_LOCKED, default_settings, resolve
from .models import Tenant, TenantCapability


class CapabilityResolverTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            company_name='Acme', slug='acme', owner_name='O',
            owner_email='o@acme.test', db_name='tenant_acme_test',
            db_user='u', db_password='p',
        )

    def test_default_product_has_no_overrides(self):
        """With no stored rows every capability sits at its registry default —
        this is the definition of "our default product"."""
        resolved = resolve(self.tenant)
        self.assertEqual(set(resolved), set(CAPABILITIES))
        for key, spec in CAPABILITIES.items():
            self.assertEqual(resolved[key]['enabled'], spec['default_enabled'], key)
            self.assertEqual(resolved[key]['settings'], default_settings(key), key)

    def test_override_replaces_default(self):
        TenantCapability.objects.create(
            tenant=self.tenant, capability_key='dashboard.stats',
            enabled=True, settings_json={'show_customer_count': False},
        )
        settings = resolve(self.tenant)['dashboard.stats']['settings']
        self.assertFalse(settings['show_customer_count'])
        # Unspecified keys still come from the registry, not from None.
        self.assertTrue(settings['show_employee_count'])

    def test_disabling_parent_cascades_to_children(self):
        TenantCapability.objects.create(
            tenant=self.tenant, capability_key='dashboard', enabled=False,
        )
        resolved = resolve(self.tenant)
        for key in ('dashboard.stats', 'dashboard.recent_activity',
                    'dashboard.module_shortcuts'):
            self.assertFalse(resolved[key]['enabled'], key)

    def test_child_cannot_re_enable_itself_above_a_disabled_parent(self):
        """The invariant that lets the frontend trust a single boolean."""
        TenantCapability.objects.create(
            tenant=self.tenant, capability_key='dashboard', enabled=False,
        )
        TenantCapability.objects.create(
            tenant=self.tenant, capability_key='dashboard.stats', enabled=True,
        )
        self.assertFalse(resolve(self.tenant)['dashboard.stats']['enabled'])

    def test_child_settings_survive_a_parent_toggle(self):
        """Turning a parent off then on again restores the child's tuning
        rather than resetting it — the "don't delete settings when hiding"
        rule."""
        TenantCapability.objects.create(
            tenant=self.tenant, capability_key='dashboard.recent_activity',
            enabled=True, settings_json={'row_count': 12},
        )
        parent = TenantCapability.objects.create(
            tenant=self.tenant, capability_key='dashboard', enabled=False,
        )
        self.assertFalse(resolve(self.tenant)['dashboard.recent_activity']['enabled'])

        parent.enabled = True
        parent.save()
        restored = resolve(self.tenant)['dashboard.recent_activity']
        self.assertTrue(restored['enabled'])
        self.assertEqual(restored['settings']['row_count'], 12)

    def test_locked_capability_ignores_a_stored_override(self):
        locked = [k for k, s in CAPABILITIES.items() if s['tier'] == TIER_LOCKED]
        self.assertTrue(locked, 'registry should define at least one locked capability')
        for key in locked:
            TenantCapability.objects.create(
                tenant=self.tenant, capability_key=key, enabled=False,
            )
            self.assertTrue(resolve(self.tenant)[key]['enabled'], key)

    def test_out_of_range_integer_falls_back_to_default(self):
        for bad in (0, 2, 9999, -5):
            TenantCapability.objects.update_or_create(
                tenant=self.tenant, capability_key='dashboard.recent_activity',
                defaults={'enabled': True, 'settings_json': {'row_count': bad}},
            )
            self.assertEqual(
                resolve(self.tenant)['dashboard.recent_activity']['settings']['row_count'],
                5, f'row_count={bad} should have fallen back',
            )

    def test_in_range_integer_is_kept(self):
        TenantCapability.objects.create(
            tenant=self.tenant, capability_key='dashboard.recent_activity',
            enabled=True, settings_json={'row_count': 10},
        )
        self.assertEqual(
            resolve(self.tenant)['dashboard.recent_activity']['settings']['row_count'], 10,
        )

    def test_wrong_typed_and_unknown_settings_are_dropped(self):
        TenantCapability.objects.create(
            tenant=self.tenant, capability_key='dashboard.recent_activity',
            enabled=True,
            settings_json={
                'row_count': 'not-an-int',
                'source': 'nonsense',
                'totally_unknown': 'x',
            },
        )
        settings = resolve(self.tenant)['dashboard.recent_activity']['settings']
        self.assertEqual(settings['row_count'], 5)
        self.assertEqual(settings['source'], 'both')
        self.assertNotIn('totally_unknown', settings)

    def test_booleans_reject_truthy_non_booleans(self):
        """`1` and `"yes"` are truthy in Python but aren't booleans — accepting
        them would let a malformed payload look like a valid config."""
        TenantCapability.objects.create(
            tenant=self.tenant, capability_key='dashboard.stats',
            enabled=True, settings_json={'show_employee_count': 1},
        )
        self.assertIs(
            resolve(self.tenant)['dashboard.stats']['settings']['show_employee_count'], True,
        )

    def test_orphan_override_for_a_removed_capability_is_ignored(self):
        """A key dropped from the registry in a later release must not break
        resolve for tenants who still have a row for it."""
        TenantCapability.objects.create(
            tenant=self.tenant, capability_key='dashboard.removed_in_v2', enabled=True,
        )
        resolved = resolve(self.tenant)
        self.assertNotIn('dashboard.removed_in_v2', resolved)
        self.assertEqual(set(resolved), set(CAPABILITIES))

    def test_resolution_is_isolated_per_tenant(self):
        other = Tenant.objects.create(
            company_name='Other', slug='other', owner_name='O',
            owner_email='o@other.test', db_name='tenant_other_test',
            db_user='u', db_password='p',
        )
        TenantCapability.objects.create(
            tenant=self.tenant, capability_key='dashboard', enabled=False,
        )
        self.assertFalse(resolve(self.tenant)['dashboard']['enabled'])
        self.assertTrue(resolve(other)['dashboard']['enabled'])
