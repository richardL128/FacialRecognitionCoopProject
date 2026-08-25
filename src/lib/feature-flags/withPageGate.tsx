import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { featureFlags } from '@/lib/feature-flags';

/**
 * Server Component HOC that gates an entire page behind a feature flag.
 * If the flag is disabled, the user is redirected (default: /dashboard).
 *
 * Usage (in a page.tsx):
 *   import { withPageGate } from '@/lib/feature-flags/withPageGate';
 *
 *   function FeaturePage() { return <div>Feature content</div>; }
 *   export default withPageGate('module:feature-a')(FeaturePage);
 *
 * Or with a custom redirect:
 *   export default withPageGate('module:feature-a', '/settings')(FeaturePage);
 */
export function withPageGate(flagKey: string, redirectTo: Route = '/dashboard') {
  return function gate<P extends object>(Component: React.ComponentType<P>): React.FC<P> {
    async function GatedPage(props: P) {
      const session = await getSessionContext();
      if (!session) redirect('/login');

      const enabled = await featureFlags.isEnabled(flagKey, {
        tenantId: session.tenantId,
      });

      if (!enabled) redirect(redirectTo);

      return <Component {...props} />;
    }

    GatedPage.displayName = `withPageGate(${flagKey})`;
    return GatedPage;
  };
}
