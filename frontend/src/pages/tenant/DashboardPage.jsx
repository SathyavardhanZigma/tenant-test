import { Link, useNavigate } from 'react-router-dom';
import { clearSession, getSessionSeed } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import Avatar from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import PageShell from '../../components/ui/PageShell';
import { useTenant } from '../../context/TenantContext';

const MODULE_CARDS = [
  { key: 'employees', icon: '👥', title: 'Employees', description: 'Manage employee records for your company.' },
  { key: 'customers', icon: '🤝', title: 'Customers', description: 'Manage customer records for your company.' },
];

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

  const enabledModules = MODULE_CARDS.filter((m) => hasFeature(tenant, m.key));

  return (
    <PageShell maxWidth="max-w-5xl" header={header}>
      <div className="mb-10 flex items-center gap-4">
        {tenant?.logo_url ? (
          <img src={tenant.logo_url} alt="" className="size-14 rounded-xl object-cover ring-1 ring-neutral-200" />
        ) : (
          <Avatar seed={getSessionSeed()} size={56} className="rounded-xl ring-1 ring-neutral-200" />
        )}
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">
            Welcome back, {tenant?.company_name || slug}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Manage your subscribed features below.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {enabledModules.map((m) => (
          <Link key={m.key} to={`/${slug}/${m.key}`}>
            <Card className="group cursor-pointer p-7 transition hover:-translate-y-0.5 hover:border-butter-300 hover:shadow-lg hover:shadow-butter-500/10">
              <span className="flex size-11 items-center justify-center rounded-xl bg-butter-50 text-xl transition group-hover:bg-butter-100">
                {m.icon}
              </span>
              <h2 className="mt-4 text-lg font-semibold text-neutral-900 group-hover:text-butter-800">{m.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{m.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-butter-800 opacity-0 transition group-hover:opacity-100">
                Open →
              </span>
            </Card>
          </Link>
        ))}
        {enabledModules.length === 0 && (
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
