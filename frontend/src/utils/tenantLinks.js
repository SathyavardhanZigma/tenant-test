import { isTenantOwner } from '../api/auth';

/** Shared tenant header nav — used by every tenant-scoped page (Dashboard,
 * Employees, Customers, Staff Permissions, Roles) so adding a new tenant
 * page's link only needs to happen here once. */
export function buildTenantLinks(slug, tenant) {
  const links = [{ label: 'Dashboard', to: `/${slug}/dashboard` }];
  if (tenant?.features?.includes('employees')) links.push({ label: 'Employees', to: `/${slug}/employees` });
  if (tenant?.features?.includes('customers')) links.push({ label: 'Customers', to: `/${slug}/customers` });
  if (isTenantOwner()) {
    links.push({ label: 'Staff', to: `/${slug}/staff` });
    // Roles is a Superadmin-toggleable module like Employees/Customers (see
    // tenants.entities.MODULE_CHOICES) — only show it once enabled for this
    // company, same as the other two.
    if (tenant?.features?.includes('roles')) links.push({ label: 'Roles', to: `/${slug}/roles` });
  }
  return links;
}
