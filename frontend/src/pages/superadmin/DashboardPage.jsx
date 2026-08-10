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
          <div>
            {tenants.length > 0 && (
              <div className="hidden border-b border-neutral-100 bg-neutral-50 px-6 py-3 text-xs font-medium uppercase tracking-wide text-neutral-500 lg:grid lg:grid-cols-[1fr_1.3fr_1fr_1.3fr_.7fr_1.5fr] lg:gap-4">
                <span>Company</span>
                <span>Login URL</span>
                <span>Owner</span>
                <span>Features</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
            )}

            <div className="divide-y divide-neutral-100">
              {tenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="grid gap-4 px-6 py-5 text-sm transition hover:bg-amber-50/40 lg:grid-cols-[1fr_1.3fr_1fr_1.3fr_.7fr_1.5fr] lg:items-center lg:gap-4"
                >
                  <Field label="Company">
                    <span className="block font-medium text-neutral-900">{tenant.company_name}</span>
                    <span className="mt-1 block text-xs text-neutral-500">
                      Plan: {tenant.plan_name ?? 'Custom'}
                    </span>
                  </Field>

                  <Field label="Login URL">
                    <a
                      href={`${window.location.origin}/${tenant.slug}/login`}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all font-mono text-indigo-600 hover:underline"
                    >
                      /{tenant.slug}/login
                    </a>
                  </Field>

                  <Field label="Owner">
                    <span className="text-neutral-700">{tenant.owner_name}</span>
                  </Field>

                  <Field label="Features">
                    <FeatureBadges tenant={tenant} />
                  </Field>

                  <Field label="Status">
                    <Badge variant={STATUS_VARIANT[tenant.status] ?? 'neutral'}>{tenant.status}</Badge>
                  </Field>

                  <Field label="Actions">
                    <ActionLinks tenant={tenant} />
                  </Field>
                </div>
              ))}

              {tenants.length === 0 && !error && (
                <EmptyState icon="🏢" title="No companies yet" hint="Onboard your first company to get started." />
              )}
            </div>
          </div>
        )}
      </Card>
    </PageShell>
  );
}

function hasFeature(tenant, featureKey) {
  return tenant.modules?.some((module) => module.module_key === featureKey && module.enabled);
}

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-neutral-400 lg:hidden">{label}</div>
      {children}
    </div>
  );
}

function FeatureBadges({ tenant }) {
  const enabledModules = tenant.modules?.filter((module) => module.enabled) ?? [];

  if (enabledModules.length === 0) {
    return <span className="text-xs text-neutral-400">None</span>;
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {enabledModules.map((module) => (
        <Badge key={module.module_key} variant="neutral">
          {module.label ?? module.module_key}
        </Badge>
      ))}
    </div>
  );
}

function ActionLinks({ tenant }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-2 text-xs font-medium">
      <Link to={`/__superadmin/companies/${tenant.slug}/users`} className="text-indigo-600 hover:text-indigo-500">
        Users
      </Link>
      {hasFeature(tenant, 'employees') && (
        <Link to={`/__superadmin/companies/${tenant.slug}/employees`} className="text-indigo-600 hover:text-indigo-500">
          Employees
        </Link>
      )}
      {hasFeature(tenant, 'customers') && (
        <Link to={`/__superadmin/companies/${tenant.slug}/customers`} className="text-indigo-600 hover:text-indigo-500">
          Customers
        </Link>
      )}
      <Link to={`/__superadmin/companies/${tenant.slug}/fields`} className="text-indigo-600 hover:text-indigo-500">
        Features & Fields
      </Link>
    </div>
  );
}
