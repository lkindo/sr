import type { Metadata, Viewport } from 'next';

import ClientLayout from '@/components/providers/ClientLayout';

import './globals.css';

export const viewport: Viewport = {
  themeColor: '#2a3053',
};

export const metadata: Metadata = {
  title: 'SR Management System',
  description: 'Service Request Management System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SR Management',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
