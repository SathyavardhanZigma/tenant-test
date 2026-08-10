import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import apiClient from '../../api/client';
import AppHeader from '../../components/ui/AppHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import Checkbox from '../../components/ui/Checkbox';
import PageShell from '../../components/ui/PageShell';
import Spinner from '../../components/ui/Spinner';

const SUPERADMIN_LINKS = [
  { label: 'Dashboard', to: '/__superadmin/dashboard' },
  { label: 'Field Catalog', to: '/__superadmin/field-catalog' },
  { label: 'Onboard', to: '/__superadmin/onboard' },
];

/** Superadmin: pick which FieldCatalog fields THIS company has enabled —
 * e.g. Tata enables 8 of the 14 Employee fields, Tesla enables all 14.
 * Saving calls the tenant's field-config endpoint, which upserts
 * TenantFieldConfig and immediately runs sync_tenant_schema server-side, so
 * the real DB column shows up right away — no separate migration step. On a
 * successful save this navigates back to the dashboard rather than leaving
 * the form sitting open. */
export default function CompanyFieldConfigPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState(null);
  const [features, setFeatures] = useState([]);
  const [plans, setPlans] = useState([]);
  const [planKey, setPlanKey] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const tenants = await apiClient.get('/superadmin/tenants/');
      const list = tenants.data.results ?? tenants.data;
      const tenant = list.find((t) => t.slug === slug);
      if (!tenant) throw new Error('not found');
      setTenantId(tenant.id);

      const [featureConfig, fieldConfig] = await Promise.all([
        apiClient.get(`/superadmin/tenants/${tenant.id}/features/`),
        apiClient.get(`/superadmin/tenants/${tenant.id}/field-config/`),
      ]);
      setFeatures(featureConfig.data.features);
      setPlans(featureConfig.data.plans);
      setPlanKey(featureConfig.data.current_plan_key ?? '');
      setRows(fieldConfig.data);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load feature and field configuration.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const toggle = (fieldId, key, value) => {
    setRows((prev) => prev.map((r) => (r.field === fieldId ? { ...r, [key]: value } : r)));
  };

  const toggleFeature = (featureKey, enabled) => {
    setPlanKey('');
    setFeatures((prev) => prev.map((feature) => (
      feature.key === featureKey ? { ...feature, enabled } : feature
    )));

    if (!enabled) {
      setRows((prev) => prev.map((row) => (
        row.feature_key === featureKey
          ? { ...row, enabled: false, is_required: false }
          : row
      )));
    }
  };

  const applyPlan = (nextPlanKey) => {
    setPlanKey(nextPlanKey);
    const selectedPlan = plans.find((plan) => plan.key === nextPlanKey);
    if (!selectedPlan) return;

    setFeatures((prev) => prev.map((feature) => ({
      ...feature,
      enabled: selectedPlan.feature_keys.includes(feature.key),
    })));
    setRows((prev) => prev.map((row) => (
      row.feature_key && !selectedPlan.feature_keys.includes(row.feature_key)
        ? { ...row, enabled: false, is_required: false }
        : row
    )));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const enabledFeatureKeys = features.filter((feature) => feature.enabled).map((feature) => feature.key);
      await apiClient.post(`/superadmin/tenants/${tenantId}/features/`, {
        plan_key: planKey,
        module_keys: enabledFeatureKeys,
      });
      await apiClient.post(
        `/superadmin/tenants/${tenantId}/field-config/`,
        rows.map((r) => {
          const featureEnabled = !r.feature_key || enabledFeatureKeys.includes(r.feature_key);
          return {
            field: r.field,
            enabled: featureEnabled ? r.enabled : false,
            is_required: featureEnabled ? r.is_required : false,
            order: r.order,
          };
        }),
      );
      navigate('/__superadmin/dashboard');
    } catch {
      setMessage({ type: 'error', text: 'Could not save feature and field configuration.' });
      setSaving(false);
    }
  };

  const enabledFeatureKeys = features.filter((feature) => feature.enabled).map((feature) => feature.key);
  const fieldFeatures = features.filter((feature) => feature.entity && feature.enabled);
  const visibleRows = rows.filter((row) => {
    return row.feature_key ? enabledFeatureKeys.includes(row.feature_key) : true;
  });
  const selectedPlan = plans.find((plan) => plan.key === planKey);

  const header = (
    <AppHeader
      brand="Superadmin"
      brandIcon="🛡️"
      brandHref="/__superadmin/dashboard"
      links={SUPERADMIN_LINKS}
      onLogout={() => {
        clearSession();
        navigate('/__superadmin');
      }}
    />
  );

  if (loading) return <PageShell header={header}><Spinner /></PageShell>;

  return (
    <PageShell maxWidth="max-w-5xl" header={header}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{slug} Setup</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Plan controls feature access. Feature access controls which fields can be configured.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="neutral">{selectedPlan?.name ?? 'Custom'} plan</Badge>
          <Badge variant="accent">{enabledFeatureKeys.length} enabled features</Badge>
        </div>
      </div>

      <div className="space-y-6">
        <SetupSection
          number="1"
          title="Subscription Plan"
          description="Choose the package this tenant pays for. Manual feature edits become a custom entitlement set."
        >
          <div className="grid gap-3 lg:grid-cols-4">
            <PlanCard
              title="Custom"
              description="Manual feature selection."
              active={!planKey}
              onClick={() => setPlanKey('')}
            />
            {plans.map((plan) => (
              <PlanCard
                key={plan.key}
                title={plan.name}
                description={plan.description}
                active={plan.key === planKey}
                featureLabels={features
                  .filter((feature) => plan.feature_keys.includes(feature.key))
                  .map((feature) => feature.label)}
                onClick={() => applyPlan(plan.key)}
              />
            ))}
          </div>
        </SetupSection>

        <SetupSection
          number="2"
          title="Feature Entitlements"
          description="Only enabled features appear in tenant navigation and pass backend permission checks."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((feature) => (
              <FeatureOption
                key={feature.key}
                feature={feature}
                checked={feature.enabled}
                onChange={(checked) => toggleFeature(feature.key, checked)}
              />
            ))}
          </div>
        </SetupSection>

        <SetupSection
          number="3"
          title="Field Configuration"
          description="Field choices are available only for enabled features that own configurable records."
        >
          {rows.length === 0 ? (
            <EmptyPanel text="The field catalog is empty. Add fields from Field Catalog first." />
          ) : fieldFeatures.length === 0 ? (
            <EmptyPanel text="Enable Employees or Customers above to configure fields for that feature." />
          ) : (
            <div className="space-y-6">
              {fieldFeatures.map((feature) => (
                <FieldGroup
                  key={feature.key}
                  title={`${feature.label} Fields`}
                  rows={visibleRows.filter((row) => row.feature_key === feature.key)}
                  toggle={toggle}
                />
              ))}
            </div>
          )}
        </SetupSection>
      </div>

      {message && (
        <p className={`mt-4 text-sm ${message.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
          {message.text}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-900">Save tenant setup</p>
          <p className="text-xs text-neutral-500">
            This updates the subscription, feature access, and field schema.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || !tenantId} className="w-full sm:w-auto">
          {saving ? 'Saving...' : 'Save setup'}
        </Button>
      </div>
    </PageShell>
  );
}

function FieldGroup({ title, rows, toggle }) {
  const enabledCount = rows.filter((row) => row.enabled).length;

  return (
    <div>
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-medium text-neutral-900">{title}</h3>
        <span className="text-xs text-neutral-500">{enabledCount} of {rows.length} enabled</span>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-6 py-3 font-medium">Field</th>
              <th className="px-6 py-3 font-medium">Type</th>
              <th className="px-6 py-3 font-medium">Enabled</th>
              <th className="px-6 py-3 font-medium">Required</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <tr key={r.field} className="hover:bg-amber-50/40">
                <td className="px-6 py-3 text-neutral-900">
                  {r.label} <span className="text-neutral-400">({r.key})</span>
                </td>
                <td className="px-6 py-3 text-neutral-500">{r.data_type}</td>
                <td className="px-6 py-3">
                  <Checkbox checked={r.enabled} onChange={(e) => toggle(r.field, 'enabled', e.target.checked)} />
                </td>
                <td className="px-6 py-3">
                  <Checkbox
                    checked={r.is_required}
                    disabled={!r.enabled}
                    onChange={(e) => toggle(r.field, 'is_required', e.target.checked)}
                    className="disabled:opacity-40"
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-neutral-400">No fields in this category.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SetupSection({ number, title, description, children }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="flex gap-4 border-b border-neutral-100 px-5 py-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
          {number}
        </span>
        <div>
          <h2 className="font-semibold text-neutral-900">{title}</h2>
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function PlanCard({ title, description, featureLabels = [], active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-36 rounded-lg border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        active ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-neutral-200 bg-neutral-50 hover:bg-white'
      }`}
    >
      <span className="block font-semibold text-neutral-900">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-neutral-500">{description}</span>
      {featureLabels.length > 0 && (
        <span className="mt-3 flex flex-wrap gap-1.5">
          {featureLabels.map((label) => (
            <Badge key={label} variant="neutral">{label}</Badge>
          ))}
        </span>
      )}
    </button>
  );
}

function FeatureOption({ feature, checked, onChange }) {
  return (
    <label
      className={`flex min-h-24 items-start gap-3 rounded-lg border px-4 py-3 text-sm transition ${
        checked ? 'border-indigo-300 bg-indigo-50/70' : 'border-neutral-200 bg-neutral-50'
      }`}
    >
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1" />
      <span>
        <span className="block font-medium text-neutral-900">{feature.label}</span>
        <span className="mt-1 block text-xs leading-5 text-neutral-500">{feature.description}</span>
        {feature.entity && <Badge variant="accent" className="mt-3">Has fields</Badge>}
      </span>
    </label>
  );
}

function EmptyPanel({ text }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-5 py-8 text-center text-sm text-neutral-500">
      {text}
    </div>
  );
}
