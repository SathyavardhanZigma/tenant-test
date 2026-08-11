import { useNavigate, useParams } from 'react-router-dom';
import { clearSession } from '../../../api/auth';
import AppHeader from '../../../components/ui/AppHeader';
import EntityManager from '../shared/EntityManager';
import { SUPERADMIN_LINKS } from '../../superadmin/links';

/** Superadmin browsing a specific company's Customer data directly —
 * see modules/employees/SuperAdminView.jsx for the equivalent Employee-side explanation. */
export default function CustomersSuperAdminView() {
  const { slug } = useParams();
  const navigate = useNavigate();

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
    <EntityManager slug={slug} entity="customers" title={`${slug} — Customers (Superadmin view)`} header={header} />
  );
}
