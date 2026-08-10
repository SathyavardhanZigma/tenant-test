import { useNavigate } from 'react-router-dom';
import { clearSession } from '../../../api/auth';
import AppHeader from '../../../components/ui/AppHeader';
import { useTenant } from '../../../context/TenantContext';
import EntityManager from '../shared/EntityManager';

export default function EmployeesTenantView() {
  const { slug, tenant } = useTenant();
  const navigate = useNavigate();

  const header = (
    <AppHeader
      brand={tenant?.company_name || slug}
      brandIcon="🏢"
      brandHref={`/${slug}/dashboard`}
      links={[
        { label: 'Dashboard', to: `/${slug}/dashboard` },
        { label: 'Employees', to: `/${slug}/employees` },
        { label: 'Customers', to: `/${slug}/customers` },
      ]}
      onLogout={() => {
        clearSession();
        navigate(`/${slug}/login`);
      }}
    />
  );

  return (
    <EntityManager
      slug={slug}
      entity="employees"
      title={`${tenant?.company_name || slug} — Employees`}
      header={header}
    />
  );
}
