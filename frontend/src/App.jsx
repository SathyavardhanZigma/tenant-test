import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { RequireSuperAdmin, RequireTenantUser } from './components/RequireAuth';
import { TenantProvider } from './context/TenantContext';
import CustomersSuperAdminView from './pages/modules/customers/SuperAdminView';
import CustomersTenantView from './pages/modules/customers/TenantView';
import EmployeesSuperAdminView from './pages/modules/employees/SuperAdminView';
import EmployeesTenantView from './pages/modules/employees/TenantView';
import CompanyCapabilitiesPage from './pages/superadmin/CompanyCapabilitiesPage';
import CompanyFieldConfigPage from './pages/superadmin/CompanyFieldConfigPage';
import CompanyLimitsPage from './pages/superadmin/CompanyLimitsPage';
import CompanyUsersPage from './pages/superadmin/CompanyUsersPage';
import SuperAdminDashboardPage from './pages/superadmin/DashboardPage';
import FieldCatalogPage from './pages/superadmin/FieldCatalogPage';
import SuperAdminLoginPage from './pages/superadmin/LoginPage';
import OnboardCompanyPage from './pages/superadmin/OnboardCompanyPage';
import TenantDashboardPage from './pages/tenant/DashboardPage';
import TenantLoginPage from './pages/tenant/LoginPage';

function TenantRoutes() {
  const { companySlug } = useParams();
  return (
    <TenantProvider>
      <Routes>
        <Route path="login" element={<TenantLoginPage />} />
        <Route
          path="dashboard"
          element={<RequireTenantUser slug={companySlug}><TenantDashboardPage /></RequireTenantUser>}
        />
        <Route
          path="employees"
          element={<RequireTenantUser slug={companySlug}><EmployeesTenantView /></RequireTenantUser>}
        />
        <Route
          path="customers"
          element={<RequireTenantUser slug={companySlug}><CustomersTenantView /></RequireTenantUser>}
        />
      </Routes>
    </TenantProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/__superadmin" replace />} />

      {/* Fixed, non-tenant superadmin routes */}
      <Route path="/__superadmin" element={<SuperAdminLoginPage />} />
      <Route
        path="/__superadmin/dashboard"
        element={<RequireSuperAdmin><SuperAdminDashboardPage /></RequireSuperAdmin>}
      />
      {/* Onboarding wizard — one route per step so each section is a real,
          bookmarkable/back-button-able URL (Company -> Modules -> Tier & Plan
          -> Limits). The same component also handles editing an existing
          company under /__superadmin/companies/:slug/edit/... below. */}
      <Route
        path="/__superadmin/onboard"
        element={<RequireSuperAdmin><OnboardCompanyPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/onboard/modules"
        element={<RequireSuperAdmin><OnboardCompanyPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/onboard/modules/tier-plan"
        element={<RequireSuperAdmin><OnboardCompanyPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/onboard/modules/tier-plan/limits"
        element={<RequireSuperAdmin><OnboardCompanyPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/onboard/modules/tier-plan/limits/fields"
        element={<RequireSuperAdmin><OnboardCompanyPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/field-catalog"
        element={<RequireSuperAdmin><FieldCatalogPage /></RequireSuperAdmin>}
      />
      {/* Superadmin browsing a specific company's data directly — same API as
          the tenant-facing pages, reached with a superadmin JWT instead. */}
      <Route
        path="/__superadmin/companies/:slug/employees"
        element={<RequireSuperAdmin><EmployeesSuperAdminView /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/companies/:slug/customers"
        element={<RequireSuperAdmin><CustomersSuperAdminView /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/companies/:slug/fields"
        element={<RequireSuperAdmin><CompanyFieldConfigPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/companies/:slug/users"
        element={<RequireSuperAdmin><CompanyUsersPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/companies/:slug/limits"
        element={<RequireSuperAdmin><CompanyLimitsPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/companies/:slug/capabilities"
        element={<RequireSuperAdmin><CompanyCapabilitiesPage /></RequireSuperAdmin>}
      />

      {/* Edit an existing company through the same step wizard as onboarding,
          prefilled with its current data. */}
      <Route
        path="/__superadmin/companies/:slug/edit"
        element={<RequireSuperAdmin><OnboardCompanyPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/companies/:slug/edit/modules"
        element={<RequireSuperAdmin><OnboardCompanyPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/companies/:slug/edit/modules/tier-plan"
        element={<RequireSuperAdmin><OnboardCompanyPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/companies/:slug/edit/modules/tier-plan/limits"
        element={<RequireSuperAdmin><OnboardCompanyPage /></RequireSuperAdmin>}
      />
      <Route
        path="/__superadmin/companies/:slug/edit/modules/tier-plan/limits/fields"
        element={<RequireSuperAdmin><OnboardCompanyPage /></RequireSuperAdmin>}
      />

      {/* Dynamic tenant-aware routes, resolved by company slug */}
      <Route path="/:companySlug/*" element={<TenantRoutes />} />
    </Routes>
  );
}
