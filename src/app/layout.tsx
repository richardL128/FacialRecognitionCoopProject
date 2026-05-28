import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'PayEvo Platform',
  description: 'PayEvo operations dashboard and feature management platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="payevo">
      <body className="antialiased">{children}</body>
    </html>
  );
}
