import { useAuth } from '../context/AuthContext';

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-wide text-zinc-100">FraudGuard</span>
        <span className="text-xs text-zinc-500">review queue</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-mono text-xs text-zinc-400">
          logged in as {user.email} ({user.role})
        </span>
        <button
          onClick={logout}
          className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
