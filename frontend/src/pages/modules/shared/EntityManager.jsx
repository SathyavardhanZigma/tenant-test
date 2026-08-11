import { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import Checkbox from '../../../components/ui/Checkbox';
import EmptyState from '../../../components/ui/EmptyState';
import Input, { Label } from '../../../components/ui/Input';
import PageShell from '../../../components/ui/PageShell';
import Pagination from '../../../components/ui/Pagination';
import Spinner from '../../../components/ui/Spinner';
import { useThrottledCallback } from '../../../hooks/useThrottledCallback';
import { createEntityService } from '../../../services/entityService';

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
  schema.filter((field) => !field.readonly).forEach((field) => {
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
 *
 * Rows come back from DRF's PageNumberPagination ({count, next, previous,
 * results}) — rendered with the shared <Pagination> component.
 *
 * `readOnly` mirrors the backend's Basic-plan restriction (see
 * core_auth/permissions.py IsTenantUserOrSuperAdmin) — Superadmin views never
 * pass it, since Superadmin always has full CRUD regardless of tenant.plan.
 */
export default function EntityManager({ slug, entity, title, header, readOnly = false }) {
  const service = useMemo(() => createEntityService(slug, entity), [slug, entity]);

  const [schema, setSchema] = useState(null);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = (targetPage = page) => {
    setLoading(true);
    setError(null);
    Promise.all([service.getSchema(), service.read({ page: targetPage })])
      .then(([schemaRes, rowsRes]) => {
        setSchema(schemaRes.data);
        setForm((prev) => (Object.keys(prev).length ? prev : emptyFormFrom(schemaRes.data)));
        const data = rowsRes.data;
        if (Array.isArray(data)) {
          // Non-paginated response (shouldn't normally happen — defensive fallback)
          setRows(data);
          setCount(data.length);
        } else {
          setRows(data.results);
          setCount(data.count);
          if (data.results.length > 0 && pageSize !== data.results.length && !data.next && targetPage === 1) {
            setPageSize(data.results.length);
          }
        }
        setPage(targetPage);
      })
      .catch(() => setError('Failed to load data for this company.'))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(1), [slug, entity]);

  const updateField = (key, dataType) => (event) => {
    const value = dataType === 'boolean' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = useThrottledCallback(async (event) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await service.create(form);
      setForm(emptyFormFrom(schema));
      load(1);
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not save. Check the fields and try again.');
    } finally {
      setSubmitting(false);
    }
  }, 600);

  const handleDelete = useThrottledCallback(async (id) => {
    try {
      await service.delete(id);
      load(rows.length === 1 && page > 1 ? page - 1 : page);
    } catch {
      setError('Could not delete that record.');
    }
  }, 600);

  if (loading && schema === null) {
    return (
      <PageShell header={header}>
        <Spinner />
      </PageShell>
    );
  }
  if (error) return <PageShell header={header}><p className="text-red-600">{error}</p></PageShell>;

  const entityLabel = entity === 'employees' ? 'employee' : 'customer';
  // `code` is server-generated (see tenants.mixins.TenantEntityViewSetMixin) —
  // never editable, so it's excluded from the Add form regardless of plan.
  const editableSchema = schema.filter((field) => !field.readonly);

  return (
    <PageShell maxWidth="max-w-6xl" header={header}>
      <h1 className="mb-6 text-2xl font-semibold text-neutral-900">{title}</h1>

      {!readOnly && (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Add {entityLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {editableSchema.length === 0 && (
              <p className="text-sm text-neutral-500 sm:col-span-2">
                No fields are enabled for this company yet — ask Superadmin to configure them.
              </p>
            )}
            {editableSchema.map((field) => (
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

            {editableSchema.length > 0 && (
              <Button type="submit" variant="create" size="lg" disabled={submitting} className="sm:col-span-2">
                {submitting ? 'Saving...' : `Add ${entityLabel}`}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              {schema.map((field) => (
                <th key={field.key} className="whitespace-nowrap px-6 py-3.5 font-medium">
                  {field.label}
                </th>
              ))}
              {!readOnly && <th className="px-6 py-3.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row) => (
              <tr key={row.id} className="transition hover:bg-butter-50">
                {schema.map((field) => (
                  <td key={field.key} className="whitespace-nowrap px-6 py-4 text-neutral-700">
                    {field.data_type === 'boolean' ? (row[field.key] ? 'Yes' : 'No') : row[field.key]}
                  </td>
                ))}
                {!readOnly && (
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(row.id)}
                      className="text-xs font-medium text-red-600 transition hover:text-red-500"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={schema.length + (readOnly ? 0 : 1)} className="px-2">
                  <EmptyState icon="📋" title="No records yet" hint={`Add your first ${entityLabel} above.`} />
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <Pagination page={page} pageSize={pageSize} count={count} onPageChange={load} loading={loading} />
      </Card>
    </PageShell>
  );
}
