import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setSession } from '../../api/auth';
import apiClient from '../../api/client';
import Button from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import Input, { Label } from '../../components/ui/Input';

export default function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError(null);
    try {
      const response = await apiClient.post('/auth/superadmin/login/', { username, password });
      setSession({ ...response.data, role: 'superadmin' });
      navigate('/__superadmin/dashboard');
    } catch {
      setSubmitError('Invalid credentials.');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-b from-amber-50 to-white px-4">
      <div className="pointer-events-none absolute -top-32 -right-20 size-96 rounded-full bg-indigo-200/40 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-amber-200/50 blur-3xl" aria-hidden="true" />

      <div className="relative w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl shadow-lg shadow-indigo-600/30">
            🛡️
          </span>
          <h1 className="mt-4 text-xl font-semibold text-neutral-900">Superadmin Console</h1>
          <p className="text-sm text-neutral-500">Manage every company from one place.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
