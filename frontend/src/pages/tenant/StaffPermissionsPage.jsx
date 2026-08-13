import { useNavigate } from 'react-router-dom';
import { clearTenantSession } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import { useTenant } from '../../context/TenantContext';
import { buildTenantLinks } from '../../utils/tenantLinks';
import StaffPermissionsManager from '../shared/StaffPermissionsManager';

/** Owner-only: manage staff module/field permissions for this company. See
 * pages/shared/StaffPermissionsManager for the actual UI — this file only
 * supplies the tenant-branded header/nav, same split as
 * modules/employees/TenantView wrapping modules/shared/EntityManager. */
export default function StaffPermissionsPage() {
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
    <StaffPermissionsManager
      slug={slug}
      header={header}
      title="Staff Permissions"
      subtitle={`Choose which modules and fields each staff login can see and edit, within what Superadmin has enabled for ${tenant?.company_name || slug}.`}
    />
  );
}
