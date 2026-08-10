import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import apiClient from '../../api/client';
import AppHeader from '../../components/ui/AppHeader';
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

      const fieldConfig = await apiClient.get(`/superadmin/tenants/${tenant.id}/field-config/`);
      setRows(fieldConfig.data);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load field configuration.' });
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

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.post(
        `/superadmin/tenants/${tenantId}/field-config/`,
        rows.map((r) => ({ field: r.field, enabled: r.enabled, is_required: r.is_required, order: r.order })),
      );
      navigate('/__superadmin/dashboard');
    } catch {
      setMessage({ type: 'error', text: 'Could not save field configuration.' });
      setSaving(false);
    }
  };

  const employeeRows = rows.filter((r) => r.entity === 'employee');
  const customerRows = rows.filter((r) => r.entity === 'customer');

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
    <PageShell maxWidth="max-w-3xl" header={header}>
      <h1 className="mb-2 text-2xl font-semibold text-neutral-900">{slug} — Field Configuration</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Pick which catalog fields this company uses. Add new fields to the catalog
        first from the Field Catalog page if the one you need isn't listed.
      </p>

      {rows.length === 0 ? (
        <Card className="p-6 text-neutral-500">
          The field catalog is empty — add fields there first.
        </Card>
      ) : (
        <div className="space-y-8">
          <FieldGroup title="Employee fields" rows={employeeRows} toggle={toggle} />
          <FieldGroup title="Customer fields" rows={customerRows} toggle={toggle} />
        </div>
      )}

      {message && (
        <p className={`mt-4 text-sm ${message.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
          {message.text}
        </p>
      )}

      {rows.length > 0 && (
        <Button onClick={handleSave} disabled={saving} className="mt-6">
          {saving ? 'Saving...' : 'Save & sync schema'}
        </Button>
      )}
    </PageShell>
  );
}

function FieldGroup({ title, rows, toggle }) {
  return (
    <div>
      <h2 className="mb-2 text-lg font-medium text-neutral-900">{title}</h2>
      <Card className="overflow-hidden">
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
