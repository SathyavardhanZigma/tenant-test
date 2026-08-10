import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession } from '../../api/auth';
import apiClient from '../../api/client';
import AppHeader from '../../components/ui/AppHeader';
import Button from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import Checkbox from '../../components/ui/Checkbox';
import Input, { Label } from '../../components/ui/Input';
import PageShell from '../../components/ui/PageShell';

const AVAILABLE_MODULES = ['employees', 'customers', 'inventory', 'billing'];

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
  const [logo, setLogo] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const updateField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const toggleModule = (moduleKey) => {
    setModules((prev) =>
      prev.includes(moduleKey) ? prev.filter((m) => m !== moduleKey) : [...prev, moduleKey],
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError(null);

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    modules.forEach((moduleKey) => payload.append('module_keys', moduleKey));
    if (logo) payload.append('logo', logo);

    try {
      await apiClient.post('/superadmin/tenants/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigate('/__superadmin/dashboard');
    } catch {
      setSubmitError('Could not create the company. Check the details and try again.');
    }
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

  return (
    <PageShell maxWidth="max-w-lg" header={header}>
      <Card>
        <CardHeader>
          <CardTitle>Onboard a new company</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="company_name">Company Name</Label>
              <Input id="company_name" value={form.company_name} onChange={updateField('company_name')} required />
            </div>
            <div>
              <Label htmlFor="slug">Company Slug (used in the login URL)</Label>
              <Input id="slug" value={form.slug} onChange={updateField('slug')} required />
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

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-neutral-700">Modules</legend>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_MODULES.map((moduleKey) => (
                  <label
                    key={moduleKey}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
                  >
                    <Checkbox checked={modules.includes(moduleKey)} onChange={() => toggleModule(moduleKey)} />
                    {moduleKey}
                  </label>
                ))}
              </div>
            </fieldset>

            {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}
            <Button type="submit" className="w-full">Create company</Button>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
