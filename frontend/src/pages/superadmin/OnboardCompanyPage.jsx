import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import apiClient from '../../api/client';
import AppHeader from '../../components/ui/AppHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Checkbox from '../../components/ui/Checkbox';
import Input, { Label } from '../../components/ui/Input';
import PageShell from '../../components/ui/PageShell';

const SUPERADMIN_LINKS = [
  { label: 'Dashboard', to: '/__superadmin/dashboard' },
  { label: 'Field Catalog', to: '/__superadmin/field-catalog' },
  { label: 'Onboard', to: '/__superadmin/onboard' },
];

export default function OnboardCompanyPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    company_name: '',
    slug: '',
    owner_name: '',
    owner_email: '',
    owner_phone: '',
  });
  const [modules, setModules] = useState([]);
  const [features, setFeatures] = useState([]);
  const [plans, setPlans] = useState([]);
  const [planKey, setPlanKey] = useState('');
  const [logo, setLogo] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    Promise.all([
      apiClient.get('/superadmin/features/'),
      apiClient.get('/superadmin/plans/'),
    ])
      .then(([featuresResponse, plansResponse]) => {
        const featureList = featuresResponse.data.results ?? featuresResponse.data;
        const planList = plansResponse.data.results ?? plansResponse.data;
        setFeatures(featureList.filter((feature) => feature.is_active));
        setPlans(planList.filter((plan) => plan.is_active));
      })
      .catch(() => setSubmitError('Could not load subscription options.'));
  }, []);

  const updateField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const applyPlan = (nextPlanKey) => {
    setPlanKey(nextPlanKey);
    const selectedPlan = plans.find((plan) => plan.key === nextPlanKey);
    if (selectedPlan) {
      setModules(selectedPlan.feature_keys);
    }
  };

  const toggleModule = (moduleKey) => {
    setPlanKey('');
    setModules((prev) =>
      prev.includes(moduleKey) ? prev.filter((m) => m !== moduleKey) : [...prev, moduleKey],
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError(null);

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    if (planKey) payload.append('plan_key', planKey);
    modules.forEach((moduleKey) => payload.append('module_keys', moduleKey));
    if (logo) payload.append('logo', logo);

    try {
      const response = await apiClient.post('/superadmin/tenants/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigate(`/__superadmin/companies/${response.data.slug}/fields`);
    } catch {
      setSubmitError('Could not create the company. Check the details and try again.');
    }
  };

  const selectedPlan = plans.find((plan) => plan.key === planKey);
  const selectedFeatureCount = modules.length;

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
    <PageShell maxWidth="max-w-5xl" header={header}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Onboard Company</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Create the tenant, assign a subscription plan, then configure fields for enabled features.
          </p>
        </div>
        <Badge variant="accent" className="w-fit">{selectedFeatureCount} features selected</Badge>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <SetupSection
          number="1"
          title="Company"
          description="This creates the tenant identity and login URL."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input id="company_name" value={form.company_name} onChange={updateField('company_name')} required />
            </div>
            <div>
              <Label htmlFor="slug">Login Slug</Label>
              <Input id="slug" value={form.slug} onChange={updateField('slug')} required />
              {form.slug && <p className="mt-1 text-xs text-neutral-500">/{form.slug}/login</p>}
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
            <div>
              <Label htmlFor="logo">Company Logo</Label>
              <input
                id="logo"
                type="file"
                accept="image/*"
                onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>
          </div>
        </SetupSection>

        <SetupSection
          number="2"
          title="Subscription Plan"
          description="Choose the commercial package first. You can still customize feature entitlements below."
        >
          <div className="grid gap-3 lg:grid-cols-4">
            <PlanCard
              title="Custom"
              description="Select features manually."
              active={!planKey}
              onClick={() => setPlanKey('')}
            />
            {plans.map((plan) => (
              <PlanCard
                key={plan.key}
                title={plan.name}
                description={plan.description}
                active={plan.key === planKey}
                featureLabels={features
                  .filter((feature) => plan.feature_keys.includes(feature.key))
                  .map((feature) => feature.label)}
                onClick={() => applyPlan(plan.key)}
              />
            ))}
          </div>
          {selectedPlan && (
            <p className="mt-3 text-xs text-neutral-500">
              {selectedPlan.name} selected. Editing features below will switch this tenant to Custom.
            </p>
          )}
        </SetupSection>

        <SetupSection
          number="3"
          title="Feature Entitlements"
          description="These are the features this tenant can access. Fields are configured after creation."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((feature) => (
              <FeatureOption
                key={feature.key}
                feature={feature}
                checked={modules.includes(feature.key)}
                onChange={() => toggleModule(feature.key)}
              />
            ))}
            {features.length === 0 && (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                No subscription features are configured.
              </div>
            )}
          </div>
        </SetupSection>

        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-900">Next step: configure fields</p>
            <p className="text-xs text-neutral-500">
              After creation, only enabled feature sections will show field choices.
            </p>
          </div>
          <Button type="submit" className="w-full sm:w-auto">Create & continue</Button>
        </div>

        {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}
      </form>
    </PageShell>
  );
}

function SetupSection({ number, title, description, children }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="flex gap-4 border-b border-neutral-100 px-5 py-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
          {number}
        </span>
        <div>
          <h2 className="font-semibold text-neutral-900">{title}</h2>
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function PlanCard({ title, description, featureLabels = [], active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-36 rounded-lg border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        active ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-neutral-200 bg-neutral-50 hover:bg-white'
      }`}
    >
      <span className="block font-semibold text-neutral-900">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-neutral-500">{description}</span>
      {featureLabels.length > 0 && (
        <span className="mt-3 flex flex-wrap gap-1.5">
          {featureLabels.map((label) => (
            <Badge key={label} variant="neutral">{label}</Badge>
          ))}
        </span>
      )}
    </button>
  );
}

function FeatureOption({ feature, checked, onChange }) {
  return (
    <label
      className={`flex min-h-24 items-start gap-3 rounded-lg border px-4 py-3 text-sm transition ${
        checked ? 'border-indigo-300 bg-indigo-50/70' : 'border-neutral-200 bg-neutral-50'
      }`}
    >
      <Checkbox checked={checked} onChange={onChange} className="mt-1" />
      <span>
        <span className="block font-medium text-neutral-900">{feature.label}</span>
        <span className="mt-1 block text-xs leading-5 text-neutral-500">{feature.description}</span>
        {feature.entity && <Badge variant="accent" className="mt-3">Has fields</Badge>}
      </span>
    </label>
  );
}
