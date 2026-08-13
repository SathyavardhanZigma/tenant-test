import { useNavigate, useParams } from 'react-router-dom';
import { clearSuperAdminSession } from '../../../api/auth';
import AppHeader from '../../../components/ui/AppHeader';
import EntityManager from '../shared/EntityManager';
import { SUPERADMIN_LINKS } from '../../superadmin/links';

/** Superadmin browsing a specific company's Employee data directly —
 * same underlying API/component as the tenant-facing page, just reached
 * via /__superadmin/companies/:slug/employees with a superadmin JWT instead
 * of a tenant-user JWT. Every write here is audit-logged server-side
 * (see tenants.mixins.TenantEntityViewSetMixin._maybe_audit). */
export default function EmployeesSuperAdminView() {
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
    <EntityManager slug={slug} entity="employees" title={`${slug} — Employees (Superadmin view)`} header={header} asSuperAdmin />
  );
}
