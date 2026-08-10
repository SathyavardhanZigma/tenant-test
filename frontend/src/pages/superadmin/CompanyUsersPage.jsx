import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import apiClient from '../../api/client';
import AppHeader from '../../components/ui/AppHeader';
import Button from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Input, { Label } from '../../components/ui/Input';
import PageShell from '../../components/ui/PageShell';
import Spinner from '../../components/ui/Spinner';

const SUPERADMIN_LINKS = [
  { label: 'Dashboard', to: '/__superadmin/dashboard' },
  { label: 'Field Catalog', to: '/__superadmin/field-catalog' },
  { label: 'Onboard', to: '/__superadmin/onboard' },
];

/** Superadmin: create/view login users for one company, and see the dynamic
 * login URL to hand off. Each company's users live in that company's own
 * database (see DOCUMENTATION.md §8.4) — creating one here writes directly
 * into that tenant's auth_user table via POST /superadmin/tenants/<id>/users/. */
export default function CompanyUsersPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const loginUrl = `${window.location.origin}/${slug}/login`;

  const load = async () => {
    setLoading(true);
    try {
      const tenants = await apiClient.get('/superadmin/tenants/');
      const list = tenants.data.results ?? tenants.data;
      const tenant = list.find((t) => t.slug === slug);
      if (!tenant) throw new Error('not found');
      setTenantId(tenant.id);

      const usersRes = await apiClient.get(`/superadmin/tenants/${tenant.id}/users/`);
      setUsers(usersRes.data);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load users for this company.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      await apiClient.post(`/superadmin/tenants/${tenantId}/users/`, form);
      setMessage({
        type: 'success',
        text: `Created "${form.username}" — share this login: ${loginUrl} (username: ${form.username}, password: ${form.password})`,
      });
      setForm({ username: '', password: '' });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Could not create user.' });
    } finally {
      setSubmitting(false);
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
      <h1 className="mb-2 text-2xl font-semibold text-neutral-900">{slug} — Users</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Login URL for this company:{' '}
        <a href={loginUrl} target="_blank" rel="noreferrer" className="font-mono text-indigo-600 hover:underline">
          {loginUrl}
        </a>
      </p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Create a login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password (min 8 characters)</Label>
              <Input
                id="password"
                type="text"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                minLength={8}
                required
              />
            </div>
            {message && (
              <p className={`text-sm sm:col-span-2 ${message.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                {message.text}
              </p>
            )}
            <Button type="submit" disabled={submitting} className="sm:col-span-2">
              {submitting ? 'Creating...' : 'Create login'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-6 py-3 font-medium">Username</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {users.map((u) => (
              <tr key={u.username}>
                <td className="px-6 py-3 font-mono text-neutral-900">{u.username}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td>
                  <EmptyState icon="🔑" title="No users yet" hint="Create the first login above." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
