import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Checkbox from '../../components/ui/Checkbox';
import Input, { Label, Select } from '../../components/ui/Input';
import PageShell from '../../components/ui/PageShell';
import Spinner from '../../components/ui/Spinner';
import { AVAILABLE_MODULES, MAX_RECORDS_OPTIONS } from '../../config/modules';
import { tenantsService } from '../../services/tenantsService';
import { SUPERADMIN_LINKS } from './links';

const DEFAULT_TABLES = [
  { table_key: 'employees', label: 'Employees', max_records: null },
  { table_key: 'customers', label: 'Customers', max_records: null },
];

const STEP_META = [
  { title: 'Company', description: 'This creates the tenant identity and login URL.' },
  { title: 'Modules', description: 'These are the modules this tenant can access.' },
  { title: 'Tier & Plan', description: 'Caps its records and what its users can do.' },
  { title: 'Limits', description: 'Per-table record caps for Complete-tier tenants.' },
];

function buildSteps(basePath) {
  const paths = [basePath, `${basePath}/modules`, `${basePath}/modules/tier-plan`, `${basePath}/modules/tier-plan/limits`];
  return paths.map((path, i) => ({ path, ...STEP_META[i] }));
}

export default function OnboardCompanyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams();
  const isEditMode = Boolean(slug);
  const basePath = isEditMode ? `/__superadmin/companies/${slug}/edit` : '/__superadmin/onboard';
  const STEPS = buildSteps(basePath);

  const formRef = useRef(null);
  const stepIndex = STEPS.findIndex((s) => s.path === location.pathname);
  const step = stepIndex === -1 ? 0 : stepIndex;

  const [tenantId, setTenantId] = useState(null);
  const [loadingTenant, setLoadingTenant] = useState(isEditMode);
  const [loadError, setLoadError] = useState(null);

  const [form, setForm] = useState({
    company_name: '',
    slug: '',
    owner_name: '',
    owner_email: '',
    owner_phone: '',
  });
  const [modules, setModules] = useState([]);
  const [tier, setTier] = useState('trial');
  const [plan, setPlan] = useState('basic');
  const [logo, setLogo] = useState(null);
  const [tables, setTables] = useState(DEFAULT_TABLES);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;

    (async () => {
      setLoadingTenant(true);
      setLoadError(null);
      try {
        const tenant = await tenantsService.findBySlug(slug);
        if (!tenant) throw new Error('not found');
        if (cancelled) return;

        setTenantId(tenant.id);
        setForm({
          company_name: tenant.company_name ?? '',
          slug: tenant.slug ?? '',
          owner_name: tenant.owner_name ?? '',
          owner_email: tenant.owner_email ?? '',
          owner_phone: tenant.owner_phone ?? '',
        });
        setModules((tenant.modules ?? []).filter((m) => m.enabled).map((m) => m.module_key));
        setTier(tenant.tier ?? 'trial');
        setPlan(tenant.plan ?? 'basic');

        const limitsRes = await tenantsService.readTableLimits(tenant.id);
        if (cancelled) return;
        setTables(limitsRes.data.tables ?? DEFAULT_TABLES);
      } catch {
        if (!cancelled) setLoadError('Could not load this company.');
      } finally {
        if (!cancelled) setLoadingTenant(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, slug]);

  const isLastStep = step === STEPS.length - 1;

  const updateField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const toggleModule = (moduleKey) => {
    setModules((prev) =>
      prev.includes(moduleKey) ? prev.filter((m) => m !== moduleKey) : [...prev, moduleKey],
    );
  };

  const updateTableLimit = (tableKey, value) => {
    setTables((prev) =>
      prev.map((t) => (t.table_key === tableKey ? { ...t, max_records: value === '' ? null : Number(value) } : t)),
    );
  };

  const goNext = () => {
    if (formRef.current && !formRef.current.checkValidity()) {
      formRef.current.reportValidity();
      return;
    }
    navigate(STEPS[Math.min(step + 1, STEPS.length - 1)].path);
  };

  const goBack = () => navigate(STEPS[Math.max(step - 1, 0)].path);

  const saveCompany = async () => {
    if (formRef.current && !formRef.current.checkValidity()) {
      formRef.current.reportValidity();
      return;
    }
    setSubmitError(null);
    setSubmitting(true);

    try {
      if (isEditMode) {
        await tenantsService.update(tenantId, {
          company_name: form.company_name,
          owner_name: form.owner_name,
          owner_email: form.owner_email,
          owner_phone: form.owner_phone,
        });
        await tenantsService.updateModules(tenantId, modules);
        await tenantsService.updateTableLimits(tenantId, { tier, plan, tables });
        navigate('/__superadmin/dashboard');
      } else {
        const payload = new FormData();
        Object.entries(form).forEach(([key, value]) => payload.append(key, value));
        payload.append('tier', tier);
        payload.append('plan', plan);
        modules.forEach((moduleKey) => payload.append('module_keys', moduleKey));
        if (logo) payload.append('logo', logo);

        const response = await tenantsService.create(payload);
        if (tables.some((t) => t.max_records != null)) {
          await tenantsService.updateTableLimits(response.data.id, { tier, plan, tables });
        }
        navigate(`/__superadmin/companies/${response.data.slug}/fields`);
      }
    } catch {
      setSubmitError(
        isEditMode
          ? 'Could not save changes. Check the details and try again.'
          : 'Could not create the company. Check the details and try again.',
      );
      setSubmitting(false);
    }
  };

  // The primary button is always type="button" with a single stable onClick —
  // never a type="submit" button that gets swapped in at the same DOM position
  // when isLastStep flips. Browsers resolve a click's default action (form
  // submit) using the button's *current* type at the end of the event, so a
  // same-position button whose type flips button->submit mid-click would
  // auto-submit the form the instant you land on the last step.
  const handlePrimaryAction = () => (isLastStep ? saveCompany() : goNext());

  // Kept only so pressing Enter in a text field still advances/submits.
  const handleFormSubmit = (event) => {
    event.preventDefault();
    handlePrimaryAction();
  };

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

  if (loadingTenant) {
    return (
      <PageShell maxWidth="max-w-full" paddingX="px-20" header={header}>
        <Spinner />
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell maxWidth="max-w-full" paddingX="px-20" header={header}>
        <p role="alert" className="text-sm text-red-600">{loadError}</p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="max-w-full" paddingX="px-20" header={header}>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            {isEditMode ? `Edit ${form.company_name || slug}` : 'Onboard Company'}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {isEditMode
              ? 'Update this company\'s details, modules, tier, plan, and record limits.'
              : 'Create the tenant, pick its modules and tier, then set limits.'}
          </p>
        </div>
        <Badge variant="accent" className="w-fit">{modules.length} modules selected</Badge>
      </div>

      <Stepper steps={STEPS} current={step} onStepClick={(i) => i < step && navigate(STEPS[i].path)} />

      <form ref={formRef} onSubmit={handleFormSubmit} className="mt-8">
        <div key={step} className="wizard-step-enter rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-6 py-5">
            <h2 className="text-lg font-semibold text-neutral-900">{STEPS[step].title}</h2>
            <p className="mt-1 text-sm text-neutral-500">{STEPS[step].description}</p>
          </div>

          <div className="p-6">
            {step === 0 && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="md:col-span-2 lg:col-span-3">
                  <Label htmlFor="company_name">Company Name</Label>
                  <Input id="company_name" value={form.company_name} onChange={updateField('company_name')} required autoFocus />
                </div>
                <div>
                  <Label htmlFor="slug">Login Slug</Label>
                  <Input id="slug" value={form.slug} onChange={updateField('slug')} required disabled={isEditMode} />
                  {form.slug && <p className="mt-1 text-xs text-neutral-500">/{form.slug}/login{isEditMode ? ' — fixed after creation' : ''}</p>}
                </div>
                <div>
                  <Label htmlFor="owner_name">Owner Name</Label>
                  <Input id="owner_name" value={form.owner_name} onChange={updateField('owner_name')} required />
                </div>
                <div>
                  <Label htmlFor="owner_email">Owner Email</Label>
                  <Input id="owner_email" type="email" value={form.owner_email} onChange={updateField('owner_email')} required />
                </div>
                <div>
                  <Label htmlFor="owner_phone">Owner Phone</Label>
                  <Input id="owner_phone" value={form.owner_phone} onChange={updateField('owner_phone')} />
                </div>
                {!isEditMode && (
                  <div className="md:col-span-2 lg:col-span-1">
                    <Label htmlFor="logo">Company Logo</Label>
                    <input
                      id="logo"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-butter-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-butter-800 hover:file:bg-butter-100"
                    />
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {AVAILABLE_MODULES.map((module) => (
                  <label
                    key={module.key}
                    className={`flex min-h-24 items-start gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                      modules.includes(module.key) ? 'border-butter-300 bg-butter-50' : 'border-neutral-200 bg-neutral-50'
                    }`}
                  >
                    <Checkbox checked={modules.includes(module.key)} onChange={() => toggleModule(module.key)} className="mt-1" />
                    <span>
                      <span className="block font-medium text-neutral-900">{module.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-neutral-500">{module.description}</span>
                      {isEditMode && (
                        <span className="mt-1 block text-xs font-medium text-red-600">
                          Unchecking this permanently drops its table and data.
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="tier">Tier</Label>
                  <Select id="tier" value={tier} onChange={(e) => setTier(e.target.value)}>
                    <option value="trial">Trial (5 records/table)</option>
                    <option value="complete">Complete (configurable)</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="plan">Plan</Label>
                  <Select id="plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
                    <option value="basic">Basic (login + read-only)</option>
                    <option value="enterprise">Enterprise (login + full CRUD)</option>
                  </Select>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-butter-200 bg-butter-50 px-4 py-3 text-xs text-butter-800">
                  {tier === 'trial'
                    ? 'Trial tenants are hard-capped at 5 records per table regardless of these settings.'
                    : `Next step: configure fields${isEditMode ? '' : ' after creation'}. Set a per-table cap below, or leave "No limit" for unlimited records.`}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tables.map((t) => (
                    <div key={t.table_key}>
                      <Label htmlFor={`limit_${t.table_key}`}>{t.label}</Label>
                      {tier === 'trial' ? (
                        <span className="inline-flex w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-400">
                          5 (trial fixed)
                        </span>
                      ) : (
                        <Select
                          id={`limit_${t.table_key}`}
                          value={t.max_records ?? ''}
                          onChange={(e) => updateTableLimit(t.table_key, e.target.value)}
                        >
                          {MAX_RECORDS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </Select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {submitError && <p role="alert" className="mt-4 text-sm text-red-600">{submitError}</p>}

        <div className="mt-6 flex items-center justify-between">
          <Button type="button" variant="secondary" onClick={goBack} disabled={step === 0}>
            Back
          </Button>
          <Button
            type="button"
            variant={isLastStep ? 'create' : 'primary'}
            size="lg"
            onClick={handlePrimaryAction}
            disabled={isLastStep && submitting}
          >
            {isLastStep ? (submitting ? 'Saving...' : (isEditMode ? 'Save changes' : 'Create & continue')) : 'Next'}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}

function Stepper({ steps, current, onStepClick }) {
  return (
    <ol className="flex items-center">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
        return (
          <li key={s.title} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => onStepClick(i)}
              disabled={state === 'upcoming'}
              className="flex flex-col items-center gap-2 disabled:cursor-default"
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition ${
                  state === 'done'
                    ? 'bg-butter-400 text-neutral-900'
                    : state === 'current'
                      ? 'bg-butter-400 text-neutral-900 ring-4 ring-butter-100'
                      : 'bg-neutral-100 text-neutral-400'
                }`}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className={`text-xs font-medium whitespace-nowrap ${state === 'upcoming' ? 'text-neutral-400' : 'text-neutral-900'}`}>
                {s.title}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span className={`mx-3 h-0.5 flex-1 rounded transition ${i < current ? 'bg-butter-400' : 'bg-neutral-200'}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
