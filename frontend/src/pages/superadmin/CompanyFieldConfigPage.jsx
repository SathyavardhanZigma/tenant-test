import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import Checkbox from '../../components/ui/Checkbox';
import PageShell from '../../components/ui/PageShell';
import Spinner from '../../components/ui/Spinner';
import { MODULE_TO_ENTITY } from '../../config/modules';
import { tenantsService } from '../../services/tenantsService';
import { SUPERADMIN_LINKS } from './links';

/** Superadmin: which of the two fixed modules (Employees, Customers) this
 * company has enabled, and — for each enabled module — which FieldCatalog
 * fields it uses. Saving calls the tenant's modules + field-config
 * endpoints, the latter immediately running sync_tenant_schema server-side
 * so the real DB column shows up right away — no separate migration step. */
export default function CompanyFieldConfigPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState(null);
  const [modules, setModules] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const tenant = await tenantsService.findBySlug(slug);
      if (!tenant) throw new Error('not found');
      setTenantId(tenant.id);

      const [modulesRes, fieldConfigRes] = await Promise.all([
        tenantsService.readModules(tenant.id),
        tenantsService.readFieldConfig(tenant.id),
      ]);
      setModules(modulesRes.data);
      setRows(fieldConfigRes.data);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load module and field configuration.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const toggleField = (fieldId, key, value) => {
    setRows((prev) => prev.map((r) => (r.field === fieldId ? { ...r, [key]: value } : r)));
  };

  const toggleModule = (moduleKey, enabled) => {
    setModules((prev) => prev.map((m) => (m.module_key === moduleKey ? { ...m, enabled } : m)));
    if (!enabled) {
      const entity = MODULE_TO_ENTITY[moduleKey];
      setRows((prev) => prev.map((r) => (r.entity === entity ? { ...r, enabled: false, is_required: false } : r)));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const enabledModuleKeys = modules.filter((m) => m.enabled).map((m) => m.module_key);
      await tenantsService.updateModules(tenantId, enabledModuleKeys);
      await tenantsService.updateFieldConfig(
        tenantId,
        rows.map((r) => ({ field: r.field, enabled: r.enabled, is_required: r.is_required, order: r.order })),
      );
      navigate('/__superadmin/dashboard');
    } catch {
      setMessage({ type: 'error', text: 'Could not save module and field configuration.' });
      setSaving(false);
    }
  };

  const enabledModules = modules.filter((m) => m.enabled);

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
    <PageShell maxWidth="max-w-4xl" header={header}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{slug} Setup</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Enabled modules control which fields can be configured below.
          </p>
        </div>
        <Badge variant="accent">{enabledModules.length} of {modules.length} modules enabled</Badge>
      </div>

      <div className="space-y-6">
        <SetupSection number="1" title="Modules" description="Only enabled modules appear in tenant navigation and pass backend permission checks.">
          <div className="grid gap-3 sm:grid-cols-2">
            {modules.map((module) => (
              <label
                key={module.module_key}
                className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                  module.enabled ? 'border-butter-300 bg-butter-50' : 'border-neutral-200 bg-neutral-50'
                }`}
              >
                <Checkbox
                  checked={module.enabled}
                  onChange={(e) => toggleModule(module.module_key, e.target.checked)}
                  className="mt-1"
                />
                <span className="font-medium text-neutral-900">{module.label}</span>
              </label>
            ))}
          </div>
        </SetupSection>

        <SetupSection number="2" title="Field Configuration" description="Field choices are only available for enabled modules.">
          {rows.length === 0 ? (
            <EmptyPanel text="The field catalog is empty. Add fields from Field Catalog first." />
          ) : enabledModules.length === 0 ? (
            <EmptyPanel text="Enable Employees or Customers above to configure fields for that module." />
          ) : (
            <div className="space-y-6">
              {enabledModules.map((module) => {
                const entity = MODULE_TO_ENTITY[module.module_key];
                return (
                  <FieldGroup
                    key={module.module_key}
                    title={`${module.label} Fields`}
                    rows={rows.filter((row) => row.entity === entity)}
                    toggle={toggleField}
                  />
                );
              })}
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
          <p className="text-xs text-neutral-500">This updates enabled modules and the field schema.</p>
        </div>
        <Button onClick={handleSave} variant="update" disabled={saving || !tenantId} size="lg" className="w-full sm:w-auto">
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
              <th className="px-6 py-3.5 font-medium">Field</th>
              <th className="px-6 py-3.5 font-medium">Type</th>
              <th className="px-6 py-3.5 font-medium">Enabled</th>
              <th className="px-6 py-3.5 font-medium">Required</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <tr key={r.field} className="transition hover:bg-butter-50">
                <td className="px-6 py-4 text-neutral-900">
                  {r.label} <span className="text-neutral-400">({r.key})</span>
                </td>
                <td className="px-6 py-4 text-neutral-500">{r.data_type}</td>
                <td className="px-6 py-4">
                  <Checkbox checked={r.enabled} onChange={(e) => toggle(r.field, 'enabled', e.target.checked)} />
                </td>
                <td className="px-6 py-4">
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
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-butter-400 text-sm font-semibold text-neutral-900">
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

function EmptyPanel({ text }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-5 py-8 text-center text-sm text-neutral-500">
      {text}
    </div>
  );
}
