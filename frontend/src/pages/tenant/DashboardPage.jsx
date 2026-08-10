import { Link, useNavigate } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import { Card } from '../../components/ui/Card';
import PageShell from '../../components/ui/PageShell';
import { useTenant } from '../../context/TenantContext';

export default function DashboardPage() {
  const { slug, tenant } = useTenant();
  const navigate = useNavigate();

  const header = (
    <AppHeader
      brand={tenant?.company_name || slug}
      brandIcon="🏢"
      brandHref={`/${slug}/dashboard`}
      links={buildTenantLinks(slug, tenant)}
      onLogout={() => {
        clearSession();
        navigate(`/${slug}/login`);
      }}
    />
  );

  return (
    <PageShell header={header}>
      <div className="mb-8 flex items-center gap-4">
        {tenant?.logo_url && (
          <img src={tenant.logo_url} alt="" className="size-14 rounded-xl object-cover ring-1 ring-neutral-200" />
        )}
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            Welcome back, {tenant?.company_name || slug}
          </h1>
          <p className="text-sm text-neutral-500">Manage your subscribed features below.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {hasFeature(tenant, 'employees') && (
          <Link to={`/${slug}/employees`}>
            <Card className="group cursor-pointer p-6 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="text-2xl">👥</span>
              <h2 className="mt-3 font-semibold text-neutral-900 group-hover:text-indigo-600">Employees</h2>
              <p className="mt-1 text-sm text-neutral-500">Manage employee records for your company.</p>
            </Card>
          </Link>
        )}
        {hasFeature(tenant, 'customers') && (
          <Link to={`/${slug}/customers`}>
            <Card className="group cursor-pointer p-6 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="text-2xl">🤝</span>
              <h2 className="mt-3 font-semibold text-neutral-900 group-hover:text-indigo-600">Customers</h2>
              <p className="mt-1 text-sm text-neutral-500">Manage customer records for your company.</p>
            </Card>
          </Link>
        )}
        {!hasFeature(tenant, 'employees') && !hasFeature(tenant, 'customers') && (
          <Card className="p-6 text-sm text-neutral-500">
            No record-management features are enabled for this company yet.
          </Card>
        )}
      </div>
    </PageShell>
  );
}

function buildTenantLinks(slug, tenant) {
  const links = [{ label: 'Dashboard', to: `/${slug}/dashboard` }];
  if (hasFeature(tenant, 'employees')) links.push({ label: 'Employees', to: `/${slug}/employees` });
  if (hasFeature(tenant, 'customers')) links.push({ label: 'Customers', to: `/${slug}/customers` });
  return links;
}

function hasFeature(tenant, featureKey) {
  return tenant?.features?.includes(featureKey);
}
