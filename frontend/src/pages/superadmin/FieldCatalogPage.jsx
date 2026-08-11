import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Input, { Label, Select } from '../../components/ui/Input';
import PageShell from '../../components/ui/PageShell';
import Pagination from '../../components/ui/Pagination';
import Spinner from '../../components/ui/Spinner';
import { fieldCatalogService } from '../../services/fieldCatalogService';
import { SUPERADMIN_LINKS } from './links';

const DATA_TYPES = ['string', 'text', 'integer', 'date', 'boolean', 'enum', 'email'];
const CATALOG_PAGE_SIZE = 8;

const ENTITIES = [
  { key: 'employee', label: 'Employee', icon: '👤' },
  { key: 'customer', label: 'Customer', icon: '🧾' },
];

const TYPE_STYLES = {
  string: 'bg-neutral-100 text-neutral-700',
  text: 'bg-neutral-100 text-neutral-700',
  integer: 'bg-sky-50 text-sky-700',
  date: 'bg-violet-50 text-violet-700',
  boolean: 'bg-emerald-50 text-emerald-700',
  enum: 'bg-amber-50 text-amber-700',
  email: 'bg-rose-50 text-rose-700',
};

/** Superadmin-only: the master list of every field a company can ever enable
 * (see DOCUMENTATION.md §8 — this is the FieldCatalog, shared across all
 * tenants; each tenant then picks a subset via its own field-config page). */
export default function FieldCatalogPage() {
  const [fields, setFields] = useState([]);
  const [form, setForm] = useState({ entity: 'employee', field_key: '', label: '', data_type: 'string' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    fieldCatalogService
      .read()
      .then((res) => setFields(res.data.results ?? res.data))
      .catch(() => setError('Failed to load field catalog.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const updateField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      await fieldCatalogService.create(form);
      setForm({ entity: form.entity, field_key: '', label: '', data_type: 'string' });
      load();
    } catch {
      setError('Could not add field — check the key is unique for this entity.');
    }
  };

  const [activeEntity, setActiveEntity] = useState('employee');
  const counts = {
    employee: fields.filter((f) => f.entity === 'employee').length,
    customer: fields.filter((f) => f.entity === 'customer').length,
  };
  const activeFields = fields.filter((f) => f.entity === activeEntity);

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

  return (
    <PageShell maxWidth="max-w-full" paddingX="px-20" header={header}>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Field Catalog</h1>
          <p className="mt-1 text-sm text-neutral-600">
            The master list of every field a company can enable for its Employee/Customer
            masters. Add fields here, then enable a subset per company from that company's
            Fields page.
          </p>
        </div>
        <Badge variant="accent" className="w-fit">{fields.length} fields total</Badge>
      </div>

      <section className="mb-8 rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-butter-400 text-base">➕</span>
          <div>
            <h2 className="font-semibold text-neutral-900">Add a field</h2>
            <p className="mt-0.5 text-sm text-neutral-500">Define a new field once, then enable it per company.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="entity">Entity</Label>
              <Select id="entity" value={form.entity} onChange={updateField('entity')}>
                <option value="employee">Employee</option>
                <option value="customer">Customer</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="data_type">Data Type</Label>
              <Select id="data_type" value={form.data_type} onChange={updateField('data_type')}>
                {DATA_TYPES.map((dt) => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="field_key">Field Key (used in the DB column and API)</Label>
              <Input id="field_key" value={form.field_key} onChange={updateField('field_key')} required placeholder="e.g. pan_number" />
            </div>
            <div>
              <Label htmlFor="label">Label (shown to users)</Label>
              <Input id="label" value={form.label} onChange={updateField('label')} required placeholder="e.g. PAN Number" />
            </div>
          </div>
          {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex justify-end">
            <Button type="submit" variant="create" size="lg">Add field</Button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-6 py-4">
          <h2 className="font-semibold text-neutral-900">Catalog</h2>
          <div className="flex gap-1.5 rounded-lg bg-neutral-100 p-1">
            {ENTITIES.map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => setActiveEntity(e.key)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  activeEntity === e.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <span>{e.icon}</span>
                {e.label}
                <span
                  className={`rounded-full px-1.5 text-xs ${
                    activeEntity === e.key ? 'bg-butter-100 text-butter-800' : 'bg-neutral-200 text-neutral-500'
                  }`}
                >
                  {counts[e.key]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-6"><Spinner /></div>
        ) : (
          <CatalogTable key={activeEntity} fields={activeFields} />
        )}
      </section>
    </PageShell>
  );
}

function CatalogTable({ fields }) {
  const [page, setPage] = useState(1);
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  const pageFields = fields.slice(start, start + CATALOG_PAGE_SIZE);

  return (
    <div className="wizard-step-enter overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-500">
          <tr>
            <th className="px-6 py-3.5 font-medium">Key</th>
            <th className="px-6 py-3.5 font-medium">Label</th>
            <th className="px-6 py-3.5 font-medium">Type</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {pageFields.map((f) => (
            <tr key={f.id} className="transition hover:bg-butter-50">
              <td className="px-6 py-4">
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600">{f.field_key}</code>
              </td>
              <td className="px-6 py-4 text-neutral-900">{f.label}</td>
              <td className="px-6 py-4">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[f.data_type] ?? 'bg-neutral-100 text-neutral-700'}`}>
                  {f.data_type}
                </span>
              </td>
            </tr>
          ))}
          {fields.length === 0 && (
            <tr>
              <td colSpan={3}>
                <EmptyState icon="🗂️" title="No fields yet" hint="Add one above to get started." />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <Pagination page={page} pageSize={CATALOG_PAGE_SIZE} count={fields.length} onPageChange={setPage} />
    </div>
  );
}
