import type { Metadata, Viewport } from 'next';

import { auth } from '@/auth';
import ClientLayout from '@/components/providers/ClientLayout';

import './globals.css';

export const metadata: Metadata = {
  title: 'SR Management System v1.0',
  description: 'Service Request Management System',
  // manifest.json은 동적 API 라우트(/manifest.json)에서 처리
  // PC에서는 PWA 비활성화, 모바일에서만 활성화
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SR Management',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': '#2a3053',
  },
};

export const viewport: Viewport = {
  themeColor: '#2a3053',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 서버가 이미 알고 있는 세션을 클라이언트 첫 렌더에 그대로 전달한다.
  // 이게 없으면 권한 기반 UI 가 전부 "빈 세션 → 권한 없음" 으로 한 번 그려진다.
  const session = await auth();

  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased">
        <ClientLayout session={session}>{children}</ClientLayout>
      </body>
    </html>
  );
}
