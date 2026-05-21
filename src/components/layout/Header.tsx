'use client';

import Link from 'next/link';
import Image from 'next/image';
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
  { label: 'Employee Database', href: '/feature-a', featureFlag: 'module:feature-a' },
  { label: 'Feature B', href: '/feature-b', featureFlag: 'module:feature-b' },
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

/** PayEvo broken-circle mark rendered as inline SVG in the brand color */
function PEMark({ size = 28, color = '#2285D0' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 43.298 43.566"
      fill="none"
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      <path
        d="M 42.075 14.447 C 40.759 10.676 38.438 7.337 35.361 4.791 C 32.284 2.245 28.57 0.587 24.619 0 L 24.766 4.317 C 28.69 5.08 32.24 7.151 34.835 10.192 C 37.431 13.233 38.919 17.064 39.056 21.059 C 39.186 25.389 37.722 29.615 34.941 32.937 C 32.161 36.257 28.257 38.442 23.973 39.076 C 19.688 39.709 15.321 38.746 11.699 36.372 C 8.076 33.997 5.453 30.376 4.324 26.193 L 0 26.34 C 0.853 30.242 2.756 33.836 5.504 36.734 C 8.252 39.632 11.74 41.724 15.591 42.783 C 19.442 43.842 23.509 43.827 27.352 42.74 C 31.196 41.655 34.669 39.538 37.396 36.62 C 40.123 33.703 42.001 30.094 42.825 26.186 C 43.651 22.277 43.39 18.218 42.075 14.447 Z"
        fill={color}
        fillRule="nonzero"
      />
    </svg>
  );
}

function AppLogo() {
  return (
    <div className="flex items-center gap-2.5" aria-label="PayEvo">
      <PEMark size={26} color="#2285D0" />
      <Image
        src="/branding/payevo-wordmark-black.svg"
        alt="PAYEVO"
        width={110}
        height={19}
        priority
        className="h-[19px] w-auto"
      />
    </div>
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

function DashboardNav({ pathname }: { pathname: string }) {
  const isDashboardActive = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const isCameraActive = pathname === '/camera' || pathname.startsWith('/camera/');
  const isActive = isDashboardActive || isCameraActive;

  return (
    <div className="group relative flex h-full items-stretch">
      <Link
        href={'/dashboard' as '/'}
        className={[
          'pe-subnav-tab relative flex h-full items-center px-5 text-[15px] font-semibold transition-colors',
          isActive ? 'text-white' : 'text-white/70 hover:text-white',
        ].join(' ')}
      >
        Dashboard
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

      <div
        className="pe-nav-panel pe-subnav-dropdown pointer-events-none invisible absolute left-0 top-full z-40 min-w-48 -translate-y-1 opacity-0 transition-all duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
        role="menu"
        aria-label="Dashboard links"
      >
        <Link
          href={'/camera' as '/'}
          className={[
            'pe-subnav-dropdown__item text-pe-grey-80 block text-sm transition-colors',
            isCameraActive ? 'bg-pe-blue-10 text-pe-blue-100' : 'hover:bg-pe-blue-10',
          ].join(' ')}
          role="menuitem"
        >
          Camera
        </Link>
      </div>
    </div>
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
        <div className="mx-auto flex h-16 max-w-360 items-center justify-between px-4">
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
            <span className="hidden text-base font-normal tracking-wide text-[rgb(var(--pe-grey-80))] sm:inline">
              PayEvo Base Platform
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
              className="pe-topnav-avatar pe-topnav-avatar--brand flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white transition hover:ring-2 hover:ring-[rgb(var(--pe-blue-80))]/40"
              aria-label="User menu"
              title="User menu"
            >
              {initials}
            </button>
          </div>
        </div>
      </div>

      {/* ── Row 2: Sub-Nav Bar (gradient blue with geometric accent) ───── */}
      <div className="pe-subnav pe-subnav--brand-gradient relative overflow-visible">
        {/* Animated shard background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <SubnavShards />
        </div>

        <div className="relative mx-auto flex h-22.5 max-w-360 items-stretch px-4">
          {/* Desktop sub-nav tabs */}
          <nav className="hidden h-full items-stretch gap-0 md:flex" aria-label="Main navigation">
            {navItems.map((item) =>
              item.href === '/dashboard' ? (
                <DashboardNav key={item.href} pathname={pathname} />
              ) : (
                <GatedNavLink key={item.href} item={item} pathname={pathname} />
              ),
            )}

            {/* Platform Support section — visible only to PLATFORM_ADMIN */}
            {isPlatformAdmin && (
              <>
                <span className="mx-2 my-auto h-8 w-px bg-white/30" aria-hidden="true" />
                <Link
                  href={'/support/feature-flags' as '/'}
                  className={[
                    'pe-subnav-tab relative flex h-full items-center px-5 text-[15px] font-semibold transition-colors',
                    pathname.startsWith('/support')
                      ? 'text-white'
                      : 'text-white/70 hover:text-white',
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
              {pathname === '/camera' || pathname.startsWith('/camera/')
                ? 'Dashboard'
                : (navItems.find(
                    (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
                  )?.label ?? 'PayEvo')}
            </span>

            <Link
              href={'/camera' as '/'}
              className="rounded-md border border-white/30 px-3 py-1 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Camera
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
