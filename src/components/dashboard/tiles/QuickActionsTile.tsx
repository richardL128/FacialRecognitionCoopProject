'use client';

import Link from 'next/link';

// Replace with your application's quick actions
const actions = [
  { label: 'Feature A', href: '/feature-a' as const },
  { label: 'Feature B', href: '/feature-b' as const },
  { label: 'Settings', href: '/settings' as const },
];

export default function QuickActionsTile() {
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          style={{
            background: 'rgb(var(--pe-ice))',
            color: 'rgb(var(--pe-blue-80))',
          }}
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}
