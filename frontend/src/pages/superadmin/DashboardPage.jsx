import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Input, { Select } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import PageShell from '../../components/ui/PageShell';
import Pagination from '../../components/ui/Pagination';
import Spinner from '../../components/ui/Spinner';
import { useDebouncedValue } from '../../hooks/useDebounce';
import { tenantsService } from '../../services/tenantsService';
import { SUPERADMIN_LINKS } from './links';

const STATUS_VARIANT = {
  active: 'success',
  suspended: 'danger',
};

const TIER_VARIANT = {
  trial: 'neutral',
  complete: 'accent',
};

const PLAN_VARIANT = {
  basic: 'neutral',
  enterprise: 'accent',
};

const PAGE_SIZE_OPTIONS = [6, 10, 20, 50, 100];

export default function SuperAdminDashboardPage() {
  const [tenants, setTenants] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingTenant, setDeletingTenant] = useState(null);
  const navigate = useNavigate();

  const debouncedSearch = useDebouncedValue(search, 350);

  const loadTenants = useCallback(() => {
    setLoading(true);
    setError(null);
    tenantsService
      .read({ page, page_size: pageSize, search: debouncedSearch || undefined })
      .then((response) => {
        const data = response.data;
        setTenants(data.results ?? data);
        setCount(data.count ?? (Array.isArray(data) ? data.length : 0));
      })
      .catch(() => setError('Failed to load tenants.'))
      .finally(() => setLoading(false));
  }, [page, pageSize, debouncedSearch]);

  useEffect(loadTenants, [loadTenants]);

  // Reset to page 1 whenever the search term or page size actually changes
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, pageSize]);

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
    <PageShell maxWidth="max-w-full" header={header}>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">Companies</h1>
          <p className="mt-1 text-sm text-neutral-500">{count} onboarded</p>
        </div>
        <Link to="/__superadmin/onboard">
          <Button variant="create" size="lg">+ Onboard company</Button>
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          placeholder="Search by company, slug, or owner..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <label htmlFor="page-size">Rows per page</label>
          <Select
            id="page-size"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="w-24"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </Select>
        </div>
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10"><Spinner /></div>
        ) : (
          <div>
            {tenants.length > 0 && (
              <div className="hidden border-b border-neutral-100 bg-neutral-50 px-6 py-3.5 text-xs font-medium uppercase tracking-wide text-neutral-500 lg:grid lg:grid-cols-[1.2fr_1.4fr_1.1fr_1.7fr_.9fr_.7fr_1.17fr] lg:gap-5">
                <span>Company</span>
                <span>Login URL</span>
                <span>Owner</span>
                <span>Modules</span>
                <span>Tier / Plan</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
            )}


            <div className="divide-y divide-neutral-100">
              {tenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="grid gap-4 px-6 py-6 text-sm transition hover:bg-butter-50 lg:grid-cols-[1.2fr_1.4fr_1.1fr_1.7fr_.9fr_.7fr_1.17fr] lg:items-center lg:gap-5"
                >
                  <Field label="Company">
                    <span className="block font-medium text-neutral-900">
                      {tenant.company_name}
                    </span>
                  </Field>

                  <Field label="Login URL">
                    <a
                      href={`${window.location.origin}/${tenant.slug}/login`}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all font-mono text-butter-700 hover:underline"
                    >
                      /{tenant.slug}/login
                    </a>
                  </Field>

                  <Field label="Owner">
                    <span className="text-neutral-700">{tenant.owner_name}</span>
                  </Field>

                  <Field label="Modules">

                    <ModuleBadges tenant={tenant} />
                  </Field>

                  <Field label="Tier / Plan">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={TIER_VARIANT[tenant.tier] ?? 'neutral'}>
                        {tenant.tier}
                      </Badge>
                      <Badge variant={PLAN_VARIANT[tenant.plan] ?? 'neutral'}>
                        {tenant.plan}
                      </Badge>
                    </div>
                  </Field>

                  <Field label="Status">
                    <Badge variant={STATUS_VARIANT[tenant.status] ?? 'neutral'}>
                      {tenant.status}
                    </Badge>
                  </Field>

                  <Field label="Actions">
                    <ActionLinks tenant={tenant} onDelete={setDeletingTenant} />
                  </Field>
                </div>
              ))}

              {tenants.length === 0 && !error && (
                <EmptyState
                  icon="🏢"
                  title={search ? 'No companies match your search' : 'No companies yet'}
                  hint={
                    search
                      ? 'Try a different search term.'
                      : 'Onboard your first company to get started.'
                  }
                />
              )}
            </div>

          </div>
        )}

        <Pagination page={page} pageSize={pageSize} count={count} onPageChange={setPage} loading={loading} />
      </Card>

      <DeleteCompanyModal
        tenant={deletingTenant}
        onClose={() => setDeletingTenant(null)}
        onDeleted={() => {
          setDeletingTenant(null);
          loadTenants();
        }}
      />
    </PageShell>
  );
}

function hasModule(tenant, moduleKey) {
  return tenant.modules?.some((module) => module.module_key === moduleKey && module.enabled);
}

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-neutral-400 lg:hidden">{label}</div>
      {children}
    </div>
  );
}

function ModuleBadges({ tenant }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1.5">

      <Badge><Link to={`/__superadmin/companies/${tenant.slug}/users`} className="text-violet-600 hover:text-violet-500" >
        Users
      </Link>

      </Badge>


      {hasModule(tenant, 'employees') && (
        <Badge>
          <Link to={`/__superadmin/companies/${tenant.slug}/employees`} className="text-blue-600 hover:text-blue-500" >
            Employees
          </Link>

        </Badge>

      )}
      {hasModule(tenant, 'customers') && (
        <Badge>
          <Link to={`/__superadmin/companies/${tenant.slug}/customers`} className="text-teal-600 hover:text-teal-500" >
            Customers
          </Link>
        </Badge>

      )}
    </div>);
}

function ActionLinks({ tenant, onDelete }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-2 text-xs font-medium">


      <Link to={`/__superadmin/companies/${tenant.slug}/edit`} className="text-butter-700 hover:text-butter-600">
        Edit
      </Link>
      <Link
        to={`/__superadmin/companies/${tenant.slug}/capabilities`}
        className="text-indigo-600 hover:text-indigo-500"
      >
        Capabilities
      </Link>
      <button type="button" onClick={() => onDelete(tenant)} className="text-red-600 hover:text-red-500">
        Delete
      </button>
    </div>
  );
}

function DeleteCompanyModal({ tenant, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (!tenant) return null;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await tenantsService.delete(tenant.id);
      onDeleted();
    } catch {
      setError('Could not delete this company. Try again.');
      setDeleting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Delete company">
      <p className="text-sm text-neutral-600">
        This permanently removes <span className="font-medium text-neutral-900">{tenant.company_name}</span> and all
        of its data — employees, customers, users, and field configuration. This cannot be undone.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-3 border-t border-neutral-100 pt-5">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete company'}
        </Button>
      </div>
    </Modal>
  );
}
