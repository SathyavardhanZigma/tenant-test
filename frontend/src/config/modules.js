/** Single source of truth for the platform's fixed module set — mirrors
 * backend/tenants/entities.py (ENTITY_TO_MODULE_KEY, MODULE_CHOICES) exactly.
 * Every screen that needs to know "what modules exist" (onboarding, field
 * config, navigation, per-module CRUD services) should derive from this
 * array rather than hardcoding its own copy. Adding a third module means
 * adding one entry here and one entry in tenants/entities.py — nothing else. */
export const AVAILABLE_MODULES = [
  {
    key: 'employees',
    entity: 'employee',
    label: 'Employees',
    description: 'Employee records and employee-specific fields.',
  },
  {
    key: 'customers',
    entity: 'customer',
    label: 'Customers',
    description: 'Customer records and customer-specific fields.',
  },
  {
    // No `entity` — Roles has no FieldCatalog-driven dynamic schema (see
    // core_auth.models.Role); it's a fixed id/name list, not a per-tenant
    // column set. Screens that build FieldCatalog sections per module (the
    // Fields step of onboarding, CompanyFieldConfigPage) must skip modules
    // with no `entity` rather than rendering an empty section for them.
    key: 'roles',
    entity: null,
    label: 'Roles',
    description: 'The Role choices available on the Employee form.',
  },
];

/** module_key -> entity ('employees' -> 'employee'), derived rather than
 * hand-maintained as a second mapping. */
export const MODULE_TO_ENTITY = Object.fromEntries(
  AVAILABLE_MODULES.map((m) => [m.key, m.entity]),
);

/** Mirrors backend/tenants/models/limits.py TRIAL_RECORD_LIMIT — the hard
 * per-table record cap for Trial-tier tenants, regardless of TenantTableLimit.
 * The Onboard wizard's create flow needs this before a tenant (and its id)
 * exist; every other screen should prefer the value the backend actually
 * returns (e.g. CompanyLimitsPage's trial_record_limit) over this constant. */
export const TRIAL_RECORD_LIMIT = 4;

export const PLAN_INFO = {
  basic: { label: 'Basic', hint: 'Login + read-only access to all data.' },
  enterprise: { label: 'Enterprise', hint: 'Login + full CRUD (create, read, update, delete).' },
};

export const MAX_RECORDS_OPTIONS = [
  { value: '', label: 'No limit' },
  { value: '200', label: '200 records' },
  { value: '500', label: '500 records' },
  { value: '1000', label: '1,000 records' },
  { value: '2000', label: '2,000 records' },
  { value: '5000', label: '5,000 records' },
  { value: '10000', label: '10,000 records' },
  { value: '50000', label: '50,000 records' },
];
