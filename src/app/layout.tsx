import type { Metadata, Viewport } from 'next';

import ClientLayout from '@/components/providers/ClientLayout';

import './globals.css';

export const metadata: Metadata = {
  title: 'SR Management System v1.0',
  description: 'Service Request Management System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SR Management',
  },
};

export const viewport: Viewport = {
  themeColor: '#2a3053',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
