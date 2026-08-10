import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import apiClient from '../../api/client';
import AppHeader from '../../components/ui/AppHeader';
import Button from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Input, { Label, Select } from '../../components/ui/Input';
import PageShell from '../../components/ui/PageShell';
import Spinner from '../../components/ui/Spinner';

const DATA_TYPES = ['string', 'text', 'integer', 'date', 'boolean', 'enum', 'email'];

const SUPERADMIN_LINKS = [
  { label: 'Dashboard', to: '/__superadmin/dashboard' },
  { label: 'Field Catalog', to: '/__superadmin/field-catalog' },
  { label: 'Onboard', to: '/__superadmin/onboard' },
];

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
    apiClient
      .get('/superadmin/field-catalog/')
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
      await apiClient.post('/superadmin/field-catalog/', form);
      setForm({ entity: form.entity, field_key: '', label: '', data_type: 'string' });
      load();
    } catch {
      setError('Could not add field — check the key is unique for this entity.');
    }
  };

  const employeeFields = fields.filter((f) => f.entity === 'employee');
  const customerFields = fields.filter((f) => f.entity === 'customer');

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
    <PageShell maxWidth="max-w-3xl" header={header}>
      <h1 className="mb-2 text-2xl font-semibold text-neutral-900">Field Catalog</h1>
      <p className="mb-6 text-sm text-neutral-600">
        The master list of every field a company can enable for its Employee/Customer
        masters. Add fields here, then enable a subset per company from that company's
        "Fields" page.
      </p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Add a field</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            {error && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{error}</p>}
            <Button type="submit" className="sm:col-span-2">Add field</Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-8">
          <CatalogTable title="Employee fields" fields={employeeFields} />
          <CatalogTable title="Customer fields" fields={customerFields} />
        </div>
      )}
    </PageShell>
  );
}

function CatalogTable({ title, fields }) {
  return (
    <div>
      <h2 className="mb-2 text-lg font-medium text-neutral-900">{title}</h2>
      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-6 py-3 font-medium">Key</th>
              <th className="px-6 py-3 font-medium">Label</th>
              <th className="px-6 py-3 font-medium">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {fields.map((f) => (
              <tr key={f.id} className="transition hover:bg-amber-50/40">
                <td className="px-6 py-3 font-mono text-neutral-500">{f.field_key}</td>
                <td className="px-6 py-3 text-neutral-900">{f.label}</td>
                <td className="px-6 py-3 text-neutral-700">{f.data_type}</td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <EmptyState icon="🗂️" title="No fields yet" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
