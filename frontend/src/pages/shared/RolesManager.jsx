import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Input, { Label } from '../../components/ui/Input';
import PageShell from '../../components/ui/PageShell';
import Spinner from '../../components/ui/Spinner';
import { createRoleService } from '../../services/roleService';

/**
 * A company's own Role list, used to populate the Employee "Role" field's
 * dropdown (FieldCatalog data_type='role') — adding a role here makes it
 * available immediately, no code change or Superadmin step needed. Shared
 * between the owner's own page (pages/tenant/RolesPage) and Superadmin's
 * per-company page (pages/superadmin/CompanyRolesPage), same split as
 * StaffPermissionsManager.
 */
export default function RolesManager({ slug, title, subtitle, header, asSuperAdmin = false }) {
  const service = useMemo(() => createRoleService(slug, { asSuperAdmin }), [slug, asSuperAdmin]);

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    service.read()
      .then((res) => setRoles(res.data.results ?? res.data))
      .catch((err) => setError(
        err.response?.status === 403
          ? 'You don\'t have access to Roles — either this company\'s owner (or Superadmin) manages it, or the Roles module isn\'t enabled for this company.'
          : 'Failed to load roles.',
      ))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [slug]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await service.create(newName.trim());
      setNewName('');
      load();
    } catch (err) {
      setError(err.response?.data?.name?.[0] || 'Could not add that role — it may already exist.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (role) => {
    setDeletingId(role.id);
    try {
      await service.delete(role.id);
      load();
    } catch {
      setError(`Could not delete "${role.name}".`);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <PageShell header={header}><Spinner /></PageShell>;

  return (
    <PageShell maxWidth="max-w-2xl" header={header}>
      <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-600">
        {subtitle || 'These are the choices shown in the Role dropdown on the Employee form. Add a new one any time — no Superadmin step needed.'}
      </p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Add a role</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="role-name">Role name</Label>
              <Input
                id="role-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. QA Engineer"
                required
              />
            </div>
            <Button type="submit" variant="create" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add role'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-6 py-3.5 font-medium">Role</th>
              <th className="px-6 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {roles.map((role) => (
              <tr key={role.id} className="transition hover:bg-butter-50">
                <td className="px-6 py-4 text-neutral-900">{role.name}</td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleDelete(role)}
                    disabled={deletingId === role.id}
                    className="text-xs font-medium text-red-600 transition hover:text-red-500 disabled:opacity-50"
                  >
                    {deletingId === role.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
            {roles.length === 0 && (
              <tr>
                <td colSpan={2}>
                  <EmptyState icon="🏷️" title="No roles yet" hint="Add your company's first role above." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
