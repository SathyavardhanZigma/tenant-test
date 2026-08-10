import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setSession } from '../../api/auth';
import apiClient from '../../api/client';
import Button from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import Input, { Label } from '../../components/ui/Input';
import Spinner from '../../components/ui/Spinner';
import { useTenant } from '../../context/TenantContext';

export default function LoginPage() {
  const { slug, tenant, loading, error } = useTenant();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError(null);
    try {
      const response = await apiClient.post(`/${slug}/auth/login/`, { username, password });
      setSession({ ...response.data, role: 'tenant_user' });
      navigate(`/${slug}/dashboard`);
    } catch {
      setSubmitError('Invalid username or password.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-50/60">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-50/60">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-b from-amber-50 to-white px-4">
      <div className="pointer-events-none absolute -top-32 -left-20 size-96 rounded-full bg-indigo-200/40 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 size-96 rounded-full bg-amber-200/50 blur-3xl" aria-hidden="true" />

      <div className="relative w-full max-w-sm">
        <div className="mb-6 text-center">
          {tenant?.logo_url ? (
            <img
              src={tenant.logo_url}
              alt={`${tenant.company_name} logo`}
              className="mx-auto size-14 rounded-2xl object-cover shadow-lg ring-1 ring-neutral-200"
            />
          ) : (
            <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl shadow-lg shadow-indigo-600/30">
              🏢
            </span>
          )}
          <h1 className="mt-4 text-xl font-semibold text-neutral-900">{tenant?.company_name || slug}</h1>
          <p className="text-sm text-neutral-500">Sign in to your workspace.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}
              <Button type="submit" className="w-full">Sign in</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
