import { Link, useLocation } from 'react-router-dom';

export default function AppHeader({ brand, brandIcon = '🏢', brandHref, links = [], onLogout }) {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link to={brandHref} className="flex items-center gap-2 font-semibold text-neutral-900">
          <span className="text-xl leading-none">{brandIcon}</span>
          <span>{brand}</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active ? 'bg-indigo-50 text-indigo-700' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          {onLogout && (
            <button
              onClick={onLogout}
              className="ml-1 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-500 transition hover:bg-red-50 hover:text-red-600"
            >
              Log out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
