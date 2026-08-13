import { useNavigate, useParams } from 'react-router-dom';
import { clearSuperAdminSession } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import StaffPermissionsManager from '../shared/StaffPermissionsManager';
import { SUPERADMIN_LINKS } from './links';

/** Superadmin: manage any company's staff module/field permissions directly
 * — same backend endpoints and UI as the company owner's own page (see
 * pages/tenant/StaffPermissionsPage), just called with the superadmin JWT
 * (IsTenantOwner passes a superadmin token through unconditionally). */
export default function CompanyStaffPermissionsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const header = (
    <AppHeader
      brand="Superadmin"
      brandIcon="🛡️"
      sessionDomain="superadmin"
      brandHref="/__superadmin/dashboard"
      links={SUPERADMIN_LINKS}
      onLogout={() => {
        clearSuperAdminSession();
        navigate('/__superadmin');
      }}
    />
  );

  return (
    <StaffPermissionsManager
      slug={slug}
      asSuperAdmin
      header={header}
      title={`${slug} — Staff Permissions`}
      subtitle="Choose which modules and fields each staff login for this company can see and edit."
    />
  );
}
