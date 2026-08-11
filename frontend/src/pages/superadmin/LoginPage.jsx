import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setSession } from '../../api/auth';
import AuthCard from '../../components/ui/AuthCard';
import AuthDecor from '../../components/ui/AuthDecor';
import Button from '../../components/ui/Button';
import Input, { Label } from '../../components/ui/Input';
import { authService } from '../../services/authService';

export default function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const response = await authService.superAdminLogin(username, password);
      setSession({ ...response.data, role: 'superadmin', username });
      navigate('/__superadmin/dashboard');
    } catch {
      setSubmitError('Invalid credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative grid min-h-screen overflow-hidden bg-linear-to-br from-butter-50 via-white to-sky-50 lg:grid-cols-2">
      <AuthDecor />

      {/* Brand panel — hidden on small screens, this is the "impress me" moment on desktop */}
      <div className="relative z-10 hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-butter-400 text-lg shadow-lg shadow-butter-500/40">🛡️</span>
          <span className="text-lg font-semibold tracking-tight text-neutral-900">Superadmin Console</span>
        </div>

        <div>
          <h1 className="auth-shimmer-text max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Run every tenant from a single control plane.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-neutral-500">
            Provision companies, configure modules and fields, manage plans and record
            limits — all from one console.
          </p>
        </div>

        <p className="text-xs text-neutral-400">© {new Date().getFullYear()} Tenant Platform</p>
      </div>

      {/* Form panel */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 py-16">
        <AuthCard className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="flex size-12 items-center justify-center rounded-xl bg-butter-400 text-xl shadow-lg shadow-butter-500/30">🛡️</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Sign in to Superadmin</h2>
          <p className="mt-1 mb-8 text-sm text-neutral-500">Enter your credentials to continue.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}
            <Button type="submit" disabled={submitting} size="lg" className="w-full">
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </AuthCard>
      </div>
    </div>
  );
}
