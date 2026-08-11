import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Input';
import PageShell from '../../components/ui/PageShell';
import Spinner from '../../components/ui/Spinner';
import { MAX_RECORDS_OPTIONS, PLAN_INFO } from '../../config/modules';
import { tenantsService } from '../../services/tenantsService';
import { SUPERADMIN_LINKS } from './links';

/** Superadmin: Trial vs Complete tier (record-count cap), Basic vs Enterprise
 * plan (read-only vs full CRUD), and — for Complete tenants — the max record
 * count per table, picked from a fixed dropdown rather than a free number. */
export default function CompanyLimitsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState(null);
  const [tier, setTier] = useState('trial');
  const [plan, setPlan] = useState('basic');
  const [trialRecordLimit, setTrialRecordLimit] = useState(5);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const tenant = await tenantsService.findBySlug(slug);
      console.log('tenant', tenant);
      if (!tenant) throw new Error('not found');
      setTenantId(tenant.id);

      const limits = await tenantsService.readTableLimits(tenant.id);
      setTier(limits.data.tier);
      setPlan(limits.data.plan);
      setTrialRecordLimit(limits.data.trial_record_limit);
      setTables(limits.data.tables);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load limits.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const updateTableLimit = (tableKey, value) => {
    setTables((prev) =>
      prev.map((t) => (t.table_key === tableKey ? { ...t, max_records: value === '' ? null : Number(value) } : t)),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await tenantsService.updateTableLimits(tenantId, { tier, plan, tables });
      setMessage({ type: 'success', text: 'Saved.' });
      load();
    } catch {
      setMessage({ type: 'error', text: 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

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
    <PageShell maxWidth="max-w-2xl" header={header}>
      <h1 className="mb-2 text-2xl font-semibold text-neutral-900">{slug} — Limits &amp; Plan</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Tier controls how many records this company can store; Plan controls whether its
        users can only view data or fully manage it.
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <label className="mb-2 block text-sm font-medium text-neutral-700">Tier</label>
          <Select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="trial">Trial ({trialRecordLimit} records/table)</option>
            <option value="complete">Complete (configurable)</option>
          </Select>
          <div className="mt-3 flex items-center gap-2">
            <Badge variant={tier === 'trial' ? 'neutral' : 'accent'}>{tier}</Badge>
            <span className="text-xs text-neutral-500">
              {tier === 'trial' ? `Hard-capped at ${trialRecordLimit}/table` : 'Set a limit per table below'}
            </span>
          </div>
        </Card>

        <Card className="p-5">
          <label className="mb-2 block text-sm font-medium text-neutral-700">Plan</label>
          <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="basic">Basic (read-only)</option>
            <option value="enterprise">Enterprise (full CRUD)</option>
          </Select>
          <div className="mt-3 flex items-center gap-2">
            <Badge variant={plan === 'enterprise' ? 'accent' : 'neutral'}>{PLAN_INFO[plan]?.label}</Badge>
            <span className="text-xs text-neutral-500">{PLAN_INFO[plan]?.hint}</span>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-6 py-3 font-medium">Table</th>
              <th className="px-6 py-3 font-medium">Max Records</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {tables.map((t) => (
              <tr key={t.table_key} className="transition hover:bg-butter-50">
                <td className="px-6 py-4 font-medium text-neutral-900">{t.label}</td>
                <td className="px-6 py-4">
                  {tier === 'trial' ? (
                    <span className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-400">
                      {trialRecordLimit} (trial fixed)
                    </span>
                  ) : (
                    <Select
                      value={t.max_records ?? ''}
                      onChange={(e) => updateTableLimit(t.table_key, e.target.value)}
                      className="w-44"
                    >
                      {MAX_RECORDS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {message && (
        <p className={`mt-4 text-sm ${message.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
          {message.text}
        </p>
      )}

      <Button onClick={handleSave} variant="update" disabled={saving} size="lg" className="mt-6">
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </PageShell>
  );
}
