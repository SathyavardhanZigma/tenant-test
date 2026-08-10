import { useEffect, useState } from 'react';
import apiClient from '../../../api/client';
import Button from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import Checkbox from '../../../components/ui/Checkbox';
import EmptyState from '../../../components/ui/EmptyState';
import Input, { Label } from '../../../components/ui/Input';
import PageShell from '../../../components/ui/PageShell';
import Spinner from '../../../components/ui/Spinner';

const INPUT_TYPE_BY_DATA_TYPE = {
  string: 'text',
  enum: 'text',
  text: 'text',
  integer: 'number',
  date: 'date',
  boolean: 'checkbox',
  email: 'email',
};

function emptyFormFrom(schema) {
  const values = {};
  schema.forEach((field) => {
    values[field.key] = field.data_type === 'boolean' ? false : '';
  });
  return values;
}

/**
 * Generic tenant-entity CRUD screen (Employee or Customer). Fields aren't
 * hardcoded — they come from GET /<slug>/<entity>/schema/, which reflects
 * that tenant's TenantFieldConfig selection (e.g. Tata sees 8 fields, Tesla
 * sees 14). Used both by tenant users (slug from the URL they're logged into)
 * and by Superadmin browsing any company's data (slug from the company picker).
 */
export default function EntityManager({ slug, entity, title, header }) {
  const [schema, setSchema] = useState(null);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiClient.get(`/${slug}/${entity}/schema/`),
      apiClient.get(`/${slug}/${entity}/`),
    ])
      .then(([schemaRes, rowsRes]) => {
        setSchema(schemaRes.data);
        setForm(emptyFormFrom(schemaRes.data));
        setRows(rowsRes.data.results ?? rowsRes.data);
      })
      .catch(() => setError('Failed to load data for this company.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [slug, entity]);

  const updateField = (key, dataType) => (event) => {
    const value = dataType === 'boolean' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiClient.post(`/${slug}/${entity}/`, form);
      setForm(emptyFormFrom(schema));
      load();
    } catch {
      setFormError('Could not save. Check the fields and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    await apiClient.delete(`/${slug}/${entity}/${id}/`);
    load();
  };

  if (loading) {
    return (
      <PageShell header={header}>
        <Spinner />
      </PageShell>
    );
  }
  if (error) return <PageShell header={header}><p className="text-red-600">{error}</p></PageShell>;

  const entityLabel = entity === 'employees' ? 'employee' : 'customer';

  return (
    <PageShell header={header}>
      <h1 className="mb-6 text-2xl font-semibold text-neutral-900">{title}</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Add {entityLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {schema.length === 0 && (
              <p className="text-sm text-neutral-500 sm:col-span-2">
                No fields are enabled for this company yet — ask Superadmin to configure them.
              </p>
            )}
            {schema.map((field) => (
              <div key={field.key}>
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-red-500"> *</span>}
                </Label>
                {field.data_type === 'boolean' ? (
                  <Checkbox
                    id={field.key}
                    checked={Boolean(form[field.key])}
                    onChange={updateField(field.key, field.data_type)}
                  />
                ) : (
                  <Input
                    id={field.key}
                    type={INPUT_TYPE_BY_DATA_TYPE[field.data_type] ?? 'text'}
                    value={form[field.key] ?? ''}
                    onChange={updateField(field.key, field.data_type)}
                    required={field.required}
                  />
                )}
              </div>
            ))}

            {formError && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{formError}</p>}

            {schema.length > 0 && (
              <Button type="submit" disabled={submitting} className="sm:col-span-2">
                {submitting ? 'Saving...' : `Add ${entityLabel}`}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              {schema.map((field) => (
                <th key={field.key} className="whitespace-nowrap px-6 py-3 font-medium">
                  {field.label}
                </th>
              ))}
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row) => (
              <tr key={row.id} className="transition hover:bg-amber-50/40">
                {schema.map((field) => (
                  <td key={field.key} className="whitespace-nowrap px-6 py-3 text-neutral-700">
                    {field.data_type === 'boolean' ? (row[field.key] ? 'Yes' : 'No') : row[field.key]}
                  </td>
                ))}
                <td className="px-6 py-3 text-right">
                  <button
                    onClick={() => handleDelete(row.id)}
                    className="text-xs font-medium text-red-600 transition hover:text-red-500"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={schema.length + 1} className="px-2">
                  <EmptyState icon="📋" title="No records yet" hint={`Add your first ${entityLabel} above.`} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
