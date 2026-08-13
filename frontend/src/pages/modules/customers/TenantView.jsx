import { useNavigate } from 'react-router-dom';
import { clearTenantSession } from '../../../api/auth';
import AppHeader from '../../../components/ui/AppHeader';
import { useTenant } from '../../../context/TenantContext';
import EntityManager from '../shared/EntityManager';

export default function CustomersTenantView() {
  const { slug, tenant } = useTenant();
  const navigate = useNavigate();

  const header = (
    <AppHeader
      brand={tenant?.company_name || slug}
      brandIcon="🏢"
      brandHref={`/${slug}/dashboard`}
      links={buildTenantLinks(slug, tenant)}
      onLogout={() => {
        clearTenantSession();
        navigate(`/${slug}/login`);
      }}
    />
  );

  return (
    <EntityManager
      slug={slug}
      entity="customers"
      title={`${tenant?.company_name || slug} — Customers`}
      header={header}
      readOnly={tenant?.plan === 'basic'}
    />
  );
}

function buildTenantLinks(slug, tenant) {
  const links = [{ label: 'Dashboard', to: `/${slug}/dashboard` }];
  if (tenant?.features?.includes('employees')) links.push({ label: 'Employees', to: `/${slug}/employees` });
  if (tenant?.features?.includes('customers')) links.push({ label: 'Customers', to: `/${slug}/customers` });
  return links;
}
