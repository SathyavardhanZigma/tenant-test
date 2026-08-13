import { useNavigate } from 'react-router-dom';
import { clearTenantSession } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import { useTenant } from '../../context/TenantContext';
import { buildTenantLinks } from '../../utils/tenantLinks';
import RolesManager from '../shared/RolesManager';

/** Owner-only: manage this company's own Employee "Role" choices. See
 * pages/shared/RolesManager for the actual UI. */
export default function RolesPage() {
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
    <RolesManager
      slug={slug}
      header={header}
      title="Roles"
    />
  );
}
