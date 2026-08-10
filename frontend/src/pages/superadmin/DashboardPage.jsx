import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { clearSession } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import PageShell from '../../components/ui/PageShell';
import Spinner from '../../components/ui/Spinner';

const STATUS_VARIANT = {
  active: 'success',
  suspended: 'danger',
};

const SUPERADMIN_LINKS = [
  { label: 'Dashboard', to: '/__superadmin/dashboard' },
  { label: 'Field Catalog', to: '/__superadmin/field-catalog' },
  { label: 'Onboard', to: '/__superadmin/onboard' },
];

export default function SuperAdminDashboardPage() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiClient
      .get('/superadmin/tenants/')
      .then((response) => setTenants(response.data.results ?? response.data))
      .catch(() => setError('Failed to load tenants.'))
      .finally(() => setLoading(false));
  }, []);

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
    <PageShell header={header}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Companies</h1>
          <p className="text-sm text-neutral-500">{tenants.length} onboarded</p>
        </div>
        <Link to="/__superadmin/onboard">
          <Button variant="accent">+ Onboard company</Button>
        </Link>
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8"><Spinner /></div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-6 py-3 font-medium">Company</th>
                <th className="px-6 py-3 font-medium">Login URL</th>
                <th className="px-6 py-3 font-medium">Owner</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="transition hover:bg-amber-50/40">
                  <td className="px-6 py-3 font-medium text-neutral-900">{tenant.company_name}</td>
                  <td className="px-6 py-3">
                    <a
                      href={`${window.location.origin}/${tenant.slug}/login`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-indigo-600 hover:underline"
                    >
                      /{tenant.slug}/login
                    </a>
                  </td>
                  <td className="px-6 py-3 text-neutral-700">{tenant.owner_name}</td>
                  <td className="px-6 py-3">
                    <Badge variant={STATUS_VARIANT[tenant.status] ?? 'neutral'}>{tenant.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right text-xs font-medium">
                    <Link to={`/__superadmin/companies/${tenant.slug}/users`} className="text-indigo-600 hover:text-indigo-500">
                      Users
                    </Link>
                    <span className="mx-2 text-neutral-300">|</span>
                    <Link to={`/__superadmin/companies/${tenant.slug}/employees`} className="text-indigo-600 hover:text-indigo-500">
                      Employees
                    </Link>
                    <span className="mx-2 text-neutral-300">|</span>
                    <Link to={`/__superadmin/companies/${tenant.slug}/customers`} className="text-indigo-600 hover:text-indigo-500">
                      Customers
                    </Link>
                    <span className="mx-2 text-neutral-300">|</span>
                    <Link to={`/__superadmin/companies/${tenant.slug}/fields`} className="text-indigo-600 hover:text-indigo-500">
                      Fields
                    </Link>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && !error && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon="🏢" title="No companies yet" hint="Onboard your first company to get started." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </PageShell>
  );
}
