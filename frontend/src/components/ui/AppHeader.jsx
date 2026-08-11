import { Link, useLocation } from 'react-router-dom';
import { getSessionSeed } from '../../api/auth';
import Avatar from './Avatar';

export default function AppHeader({ brand, brandIcon = '🏢', brandHref, links = [], onLogout }) {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200/80 bg-white/90 shadow-sm backdrop-blur-sm">
      <div className="flex w-full items-center justify-between px-20 py-3.5">
        <Link to={brandHref} className="flex items-center gap-2.5 font-semibold text-neutral-900">
          <span className="flex size-8 items-center justify-center rounded-lg bg-butter-400 text-base leading-none text-neutral-900 shadow-sm shadow-butter-500/30">
            {brandIcon}
          </span>
          <span className="text-[15px] tracking-tight">{brand}</span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`relative rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  active ? 'text-butter-800' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
              >
                {link.label}
                {active && <span className="absolute inset-x-3 -bottom-3.75 h-0.5 rounded-full bg-butter-500" />}
              </Link>
            );
          })}

          {onLogout && (
            <div className="ml-3 flex items-center gap-2 border-l border-neutral-200 pl-3">
              <Avatar seed={getSessionSeed()} size={30} />
              <button
                onClick={onLogout}
                className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-500 transition hover:bg-red-50 hover:text-red-600"
              >
                Log out
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
