import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Menu, X, Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import usePWAInstall from '../../hooks/usePWAInstall';
import ConfirmDialog from '../ui/ConfirmDialog';

/**
 * The shell both portals share.
 *
 * The farmer and admin layouts were two near-identical 130-line files, so a
 * fix to one (the drawer ignoring Escape, the hardcoded black scrim) had to be
 * remembered twice. They now differ only in their nav items and their footer
 * identity.
 *
 * `bottomNav` adds a thumb-reachable tab bar on phones. Farmers are the
 * primary mobile users of this app, and reaching every destination through a
 * hamburger menu at the top of the screen is the wrong shape for one-handed
 * use in a field.
 */
export default function PortalLayout({
  brandTitle,
  brandSubtitle,
  navItems,
  footerLinks = [],
  identity,
  bottomNav = [],
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const { canInstall, promptInstall } = usePWAInstall();

  // Close the drawer whenever the route changes, so a back-gesture or an
  // in-page link never leaves it hanging open over the new screen.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (e) => e.key === 'Escape' && setDrawerOpen(false);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  const handleSignOut = () => {
    logout();
    navigate('/');
  };

  /**
   * One active-state language for every nav surface in both portals: a
   * honey-amber marker, ink text and medium weight. The sidebar wears it as a
   * filled row with a leading rule, the phone tab bar as a rule along the top
   * edge — the same signal in the shape each surface allows, rather than the
   * amber fill in one place and a bare colour shift in the other.
   */
  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-md border-l-2 py-2.5 pl-2.5 pr-3 text-body transition-colors ${
      isActive
        ? 'border-honey-amber bg-honey-amber/25 font-medium text-ink'
        : 'border-transparent text-saddle hover:bg-parchment hover:text-ink'
    }`;

  const sidebar = (
    <>
      <div className="border-b border-bone p-5">
        <div className="flex items-center gap-3">
          <img
            src="/images/government-emblem.png"
            alt=""
            className="h-9 w-9 shrink-0 object-contain"
          />
          <div className="min-w-0">
            <p className="truncate text-body-lg font-medium text-ink">{brandTitle}</p>
            <p className="eyebrow">{brandSubtitle}</p>
          </div>
        </div>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
            <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}

        {footerLinks.length > 0 && (
          <div className="mt-4 space-y-1 border-t border-bone pt-4">
            {footerLinks.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      <div className="space-y-3 border-t border-bone p-4">
        {canInstall && (
          <button type="button" onClick={promptInstall} className="btn btn-outline btn-sm w-full">
            <Download className="h-4 w-4" aria-hidden="true" /> Install app
          </button>
        )}
        <div>
          <p className="truncate text-body font-medium text-ink">{identity.name}</p>
          <p className="truncate text-caption text-bark">{identity.detail}</p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmSignOut(true)}
          className="btn btn-ghost btn-sm w-full justify-start text-saddle"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-parchment">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-honey-amber focus:px-4 focus:py-2 focus:text-body focus:text-ink"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-bone bg-pure-white lg:flex">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/40"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-bone bg-pure-white"
          >
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="btn btn-ghost btn-sm btn-circle absolute right-3 top-3 text-bark"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:ml-64">
        {/* Mobile header */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-bone bg-pure-white px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="btn btn-ghost btn-sm btn-circle text-saddle"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <p className="min-w-0 flex-1 truncate text-body-lg font-medium text-ink">{brandTitle}</p>
          {canInstall && (
            <button
              type="button"
              onClick={promptInstall}
              aria-label="Install app"
              className="btn btn-ghost btn-sm btn-circle text-saddle"
            >
              <Download className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </header>

        <main
          id="main-content"
          className={`px-4 py-6 sm:px-6 lg:px-10 lg:py-10 ${bottomNav.length ? 'pb-24 lg:pb-10' : ''}`}
        >
          <Outlet />
        </main>
      </div>

      {/* Phone tab bar */}
      {bottomNav.length > 0 && (
        <nav
          aria-label="Quick navigation"
          className="fixed inset-x-0 bottom-0 z-30 grid border-t border-bone bg-pure-white pb-[env(safe-area-inset-bottom)] lg:hidden"
          style={{ gridTemplateColumns: `repeat(${bottomNav.length}, minmax(0, 1fr))` }}
        >
          {bottomNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-2 px-1 py-2 text-caption transition-colors ${
                  isActive
                    ? 'border-honey-amber bg-honey-amber/15 font-medium text-ink'
                    : 'border-transparent text-bark'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={`h-5 w-5 ${isActive ? 'text-ink' : 'text-bark'}`}
                    aria-hidden="true"
                  />
                  <span>{item.short || item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}

      <ConfirmDialog
        open={confirmSignOut}
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={handleSignOut}
        title="Sign out?"
        description="You will need your mobile number and a fresh OTP to sign back in."
        confirmLabel="Sign out"
      />
    </div>
  );
}
