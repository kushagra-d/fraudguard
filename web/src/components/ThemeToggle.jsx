import { useEffect, useState } from 'react';

function getInitialTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="flex h-7 w-7 items-center justify-center rounded border border-border text-ink-muted transition-colors hover:border-brass hover:text-brass focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 1.78a1 1 0 011.41 1.41l-.7.71a1 1 0 11-1.42-1.42l.71-.7zM17 9a1 1 0 110 2h-1a1 1 0 110-2h1zM3 9a1 1 0 110 2H2a1 1 0 110-2h1zm12.02 5.36a1 1 0 011.42 1.42l-.71.7a1 1 0 01-1.41-1.41l.7-.71zM5.64 4.22a1 1 0 011.42 1.41l-.71.71a1 1 0 01-1.41-1.42l.7-.7zM10 6a4 4 0 100 8 4 4 0 000-8zM4.22 14.36a1 1 0 011.41-1.42l.71.71a1 1 0 11-1.42 1.41l-.7-.7zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}
