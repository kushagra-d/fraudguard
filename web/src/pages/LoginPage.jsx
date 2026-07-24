import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token } = await apiFetch('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      login(token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-abyss px-4">
      {/* Ambient atmosphere - a faint brass glow anchored above the card, not a
          decorative hero. Keeps the page from reading as one flat fill. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[18%] h-[420px] w-[620px] -translate-x-1/2 rounded-full opacity-[0.12] blur-[110px]"
        style={{ backgroundColor: 'var(--color-brass)' }}
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-raised"
      >
        <div className="mb-1 h-0.5 w-8 rounded-full bg-brass" aria-hidden="true" />
        <h1 className="mb-1 mt-4 font-display text-xl font-semibold text-ink">FraudGuard</h1>
        <p className="mb-7 text-xs text-ink-muted">Analyst / admin sign in</p>

        <label className="mb-1 block text-xs text-ink-muted">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded border border-border bg-abyss px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brass"
        />

        <label className="mb-1 block text-xs text-ink-muted">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-border bg-abyss px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brass"
        />

        {error && (
          <p className="mb-4 rounded border border-alarm/40 bg-alarm-bg px-3 py-2 text-xs text-alarm">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-brass px-3 py-2 text-sm font-medium text-abyss transition-colors hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
