import type { Metadata } from 'next';
import { Open_Sans } from 'next/font/google';
import '@/styles/globals.css';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-open-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PayEvo Platform',
  description: 'PayEvo operations dashboard and feature management platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="payevo" className={openSans.variable}>
      <body className={`antialiased ${openSans.className}`}>{children}</body>
    </html>
  );
}
