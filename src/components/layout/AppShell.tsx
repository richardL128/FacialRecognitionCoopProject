'use client';

import Header from './Header';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col text-[rgb(var(--pe-grey-100))]">
      <Header />
      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6 md:py-7">
        <div className="pe-page-shell">{children}</div>
      </main>
    </div>
  );
}
