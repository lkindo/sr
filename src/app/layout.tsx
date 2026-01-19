import './globals.css';

import type { Metadata } from 'next';

import ClientLayout from '@/components/providers/ClientLayout';

export const metadata: Metadata = {
  title: 'SR Management System',
  description: 'Service Request Management System',
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
