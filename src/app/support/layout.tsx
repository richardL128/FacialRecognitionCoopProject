import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/session';
import AppShell from '@/components/layout/AppShell';

/**
 * Layout for the /support/* pages.
 * Server-side auth guard: only PLATFORM_ADMIN can access these pages.
 * Non-admin users are silently redirected to the dashboard.
 */
export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();

  if (!session || session.role !== 'PLATFORM_ADMIN') {
    redirect('/dashboard');
  }

  return <AppShell>{children}</AppShell>;
}
