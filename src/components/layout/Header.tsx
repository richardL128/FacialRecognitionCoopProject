'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const productLogos = [
  { src: '/branding/products/payroll-default.svg', alt: 'Payroll' },
  { src: '/branding/products/hr-black.png', alt: 'HR' },
  { src: '/branding/products/workflow-default.svg', alt: 'Workflow' },
];

/* ── Logo ─────────────────────────────────────────────────────────────────── */

function AppLogo() {
  return (
    <Image
      src="/branding/payevo-wordmark-black.svg"
      alt="PayEvo"
      width={170}
      height={28}
      priority
      className="h-7 w-auto"
    />
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

function HeaderLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const isActive =
    href === '/dashboard'
      ? pathname === href || pathname.startsWith('/dashboard/')
      : pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href as '/'}
      className={[
        'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
        isActive
          ? 'border-[rgb(var(--pe-blue-80))] bg-[rgb(var(--pe-blue-10))] text-[rgb(var(--pe-blue-80))]'
          : 'border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] text-[rgb(var(--pe-grey-70))] hover:bg-[rgb(var(--pe-blue-10))]',
      ].join(' ')}
    >
      {label}
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
      <div className="pe-topnav-bar border-b border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-grey-5))] shadow-[0_2px_10px_rgba(10,45,78,0.06)]">
        <div className="mx-auto flex h-14 max-w-360 items-center justify-between px-4">
          {/* Left cluster */}
          <div className="flex items-center gap-3">
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
            <div className="hidden items-center gap-2 xl:flex" aria-label="PayEvo product visuals">
              {productLogos.map((logo) => (
                <span key={logo.src} className="pe-logo-chip px-3">
                  <Image
                    src={logo.src}
                    alt={logo.alt}
                    width={88}
                    height={16}
                    className="h-4 w-auto"
                  />
                </span>
              ))}
            </div>

            <div
              className="pe-topnav-avatar pe-topnav-avatar--brand flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
              aria-label="Current user initials"
            >
              {initials}
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))]">
        <div className="mx-auto flex max-w-360 items-center gap-2 overflow-x-auto px-4 py-2">
          <HeaderLink href="/dashboard" label="Dashboard" pathname={pathname} />
          <HeaderLink href="/camera/recent" label="Recent Captures" pathname={pathname} />
          <HeaderLink href="/feature-a" label="Employee Database" pathname={pathname} />
          {isPlatformAdmin && (
            <HeaderLink href="/support/feature-flags" label="Support" pathname={pathname} />
          )}
        </div>
      </div>
    </header>
  );
}
