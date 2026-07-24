import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="relative z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-3.5 shadow-card">
      <div className="flex items-baseline gap-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-hidden="true" />
        <span className="font-display text-sm font-semibold tracking-wide text-ink">
          FraudGuard
        </span>
        <span className="text-xs text-ink-muted">review queue</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-ink-muted">
          logged in as {user.email} ({user.role})
        </span>
        <ThemeToggle />
        <button
          onClick={logout}
          className="rounded border border-border px-3 py-1 text-xs text-ink transition-colors hover:border-brass hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
