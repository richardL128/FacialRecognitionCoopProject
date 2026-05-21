'use client';

import Header from './Header';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-dvh flex-col text-[rgb(var(--pe-grey-100))]"
      style={{ background: 'rgb(var(--pe-ice))' }}
    >
      <Header />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
