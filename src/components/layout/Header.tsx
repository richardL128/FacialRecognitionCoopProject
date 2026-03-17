'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import SubnavShards from './SubnavShards';

/* ── Navigation items ────────────────────────────────────────────────────── */

type NavItem = {
  label: string;
  href: string;
  /** If set, the nav item is hidden when this feature flag is disabled */
  featureFlag?: string;
};

// Replace these with your application's navigation items.
// Set featureFlag to gate a nav item behind a feature flag.
const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Feature A', href: '/feature-a', featureFlag: 'module:feature-a' },
  { label: 'Feature B', href: '/feature-b', featureFlag: 'module:feature-b' },
  { label: 'Settings', href: '/settings' },
];

/* ── Inline icons ────────────────────────────────────────────────────────── */

function WaffleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="1.8" />
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="19" cy="5" r="1.8" />
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
      <circle cx="5" cy="19" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
      <circle cx="19" cy="19" r="1.8" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.67 1.016H16.586a.75.75 0 00.67-1.016A11.954 11.954 0 0116 8a6 6 0 00-6-6zM8 18a2 2 0 104 0H8z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.372a.75.75 0 01.573-.729 1.5 1.5 0 10-1.875-2.864zM10 15a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* ── Logo ─────────────────────────────────────────────────────────────────── */

function AppLogo() {
  return (
    <svg viewBox="0 0 120 32" className="h-7 w-auto" fill="currentColor" aria-label="PayEvo">
      <text
        x="0"
        y="24"
        fontFamily="'Open Sans', sans-serif"
        fontWeight="700"
        fontSize="20"
        letterSpacing="1"
      >
        PAY
      </text>
      <text
        x="52"
        y="24"
        fontFamily="'Open Sans', sans-serif"
        fontWeight="300"
        fontSize="20"
        letterSpacing="1"
      >
        EVO
      </text>
    </svg>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function getInitials(email: string): string {
  const parts = email.split('@')[0]?.split('.') ?? [];
  return parts
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Renders a nav link only if its feature flag is enabled (or if no flag is set) */
function GatedNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { enabled, loading } = useFeatureFlag(item.featureFlag ?? null);

  if (item.featureFlag && !loading && !enabled) return null;
  if (item.featureFlag && loading) return null;

  const isActive =
    item.href === '/dashboard'
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + '/');

  return (
    <Link
      href={item.href as '/'}
      className={[
        'pe-subnav-tab relative flex h-full items-center px-5 text-[15px] font-semibold transition-colors',
        isActive ? 'text-white' : 'text-white/70 hover:text-white',
      ].join(' ')}
    >
      {item.label}
      {isActive && (
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-px"
          aria-hidden="true"
        >
          <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
            <path d="M8 0L16 10H0L8 0z" fill="var(--pe-subnav-caret, rgb(var(--pe-ice)))" />
          </svg>
        </span>
      )}
    </Link>
  );
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function Header() {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const initials = getInitials(user?.email ?? 'user@example.com');
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';

  return (
    <header className="pe-topnav relative z-30">
      {/* ── Row 1: Top Nav Bar ─────────────────────────────────────────── */}
      <div className="pe-topnav-bar border-b border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-grey-5))]">
        <div className="mx-auto flex h-14 max-w-360 items-center justify-between px-4">
          {/* Left cluster */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex items-center justify-center rounded p-1 text-[rgb(var(--pe-grey-60))] transition hover:bg-[rgb(var(--pe-grey-10))] hover:text-[rgb(var(--pe-grey-100))]"
              aria-label="App launcher"
              title="App launcher"
            >
              <WaffleIcon />
            </button>

            <AppLogo />

            <span
              className="hidden text-lg text-[rgb(var(--pe-grey-40))] sm:inline"
              aria-hidden="true"
            >
              |
            </span>
            {/* Replace "App Name" with your product name */}
            <span className="hidden text-base font-normal tracking-wide text-[rgb(var(--pe-grey-80))] sm:inline">
              App Name
            </span>
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-1 md:flex">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--pe-grey-60))] transition hover:bg-[rgb(var(--pe-grey-10))] hover:text-[rgb(var(--pe-grey-100))]"
                aria-label="Help"
                title="Help"
              >
                <HelpIcon />
              </button>
              <button
                type="button"
                className="relative flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--pe-grey-60))] transition hover:bg-[rgb(var(--pe-grey-10))] hover:text-[rgb(var(--pe-grey-100))]"
                aria-label="Notifications"
                title="Notifications"
              >
                <BellIcon />
              </button>
            </div>

            <button
              type="button"
              className="pe-topnav-avatar flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white transition hover:ring-2 hover:ring-[rgb(var(--pe-blue-80))]/40"
              style={{ background: 'rgb(var(--pe-blue-100))' }}
              aria-label="User menu"
              title="User menu"
            >
              {initials}
            </button>
          </div>
        </div>
      </div>

      {/* ── Row 2: Sub-Nav Bar (gradient blue with geometric accent) ───── */}
      <div
        className="pe-subnav relative overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, rgb(var(--pe-blue-80)) 0%, rgb(var(--pe-blue-80)) 30%, rgb(var(--pe-blue-60)) 60%, rgb(var(--pe-blue-100)) 100%)',
        }}
      >
        {/* Animated shard background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <SubnavShards />
        </div>

        <div className="relative mx-auto flex h-22.5 max-w-360 items-stretch px-4">
          {/* Desktop sub-nav tabs */}
          <nav className="hidden h-full items-stretch gap-0 md:flex" aria-label="Main navigation">
            {navItems.map((item) => (
              <GatedNavLink key={item.href} item={item} pathname={pathname} />
            ))}

            {/* Platform Support section — visible only to PLATFORM_ADMIN */}
            {isPlatformAdmin && (
              <>
                <span className="mx-2 my-auto h-8 w-px bg-white/30" aria-hidden="true" />
                <Link
                  href={'/support/feature-flags' as '/'}
                  className={[
                    'pe-subnav-tab relative flex h-full items-center px-5 text-[15px] font-semibold transition-colors',
                    pathname.startsWith('/support') ? 'text-white' : 'text-white/70 hover:text-white',
                  ].join(' ')}
                >
                  Support
                  {pathname.startsWith('/support') && (
                    <span
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-px"
                      aria-hidden="true"
                    >
                      <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
                        <path
                          d="M8 0L16 10H0L8 0z"
                          fill="var(--pe-subnav-caret, rgb(var(--pe-ice)))"
                        />
                      </svg>
                    </span>
                  )}
                </Link>
              </>
            )}
          </nav>

          {/* Mobile: show current section name */}
          <div className="flex w-full items-center justify-between py-4 md:hidden">
            <span className="text-sm font-semibold text-white">
              {navItems.find(
                (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
              )?.label ?? 'App Name'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
