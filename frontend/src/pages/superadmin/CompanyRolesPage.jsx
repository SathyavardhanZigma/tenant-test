import { useNavigate, useParams } from 'react-router-dom';
import { clearSuperAdminSession } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import RolesManager from '../shared/RolesManager';
import { SUPERADMIN_LINKS } from './links';

/** Superadmin: manage any company's Role list directly — same backend
 * endpoint and UI as the company owner's own page (see
 * pages/tenant/RolesPage), just called with the superadmin JWT. */
export default function CompanyRolesPage() {
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
    <RolesManager
      slug={slug}
      asSuperAdmin
      header={header}
      title={`${slug} — Roles`}
    />
  );
}
