import { useNavigate } from 'react-router-dom';
import { clearTenantSession } from '../../../api/auth';
import AppHeader from '../../../components/ui/AppHeader';
import { useTenant } from '../../../context/TenantContext';
import { buildTenantLinks } from '../../../utils/tenantLinks';
import EntityManager from '../shared/EntityManager';

export default function EmployeesTenantView() {
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
      entity="employees"
      title={`${tenant?.company_name || slug} — Employees`}
      header={header}
      readOnly={tenant?.plan === 'basic'}
    />
  );
}
