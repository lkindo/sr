import { NextRequest, NextResponse } from 'next/server';

/**
 * 동적 manifest.json 생성
 * PC에서는 PWA 설치를 비활성화하고, 모바일에서만 활성화
 */
export async function GET(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || '';

  // 모바일 기기 감지
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  const isIpad =
    /iPad/.test(userAgent) || (userAgent.includes('Macintosh') && userAgent.includes('Touch'));
  const isMobile = mobileRegex.test(userAgent) || isIpad;

  const manifest: Record<string, any> = {
    name: 'Service Request Management',
    short_name: 'SR Mgt',
    description: '기업용 서비스 요청 및 처리 관리 시스템',
    start_url: '/dashboard',
    // PC에서는 PWA 설치 비활성화를 위해 display: browser 사용
    display: isMobile ? 'standalone' : 'browser',
    background_color: '#2a3053',
    theme_color: '#2a3053',
    orientation: 'portrait',
  };

  // 모바일에서만 아이콘 추가 (PWA 설치 프롬프트 발생 조건)
  if (isMobile) {
    manifest.icons = [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ];
    manifest.prefer_related_applications = false;
  } else {
    // PC에서는 아이콘을 제공하지 않아 PWA 설치 프롬프트가 발생하지 않음
    manifest.icons = [];
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // 1시간 캐시
    },
  });
}
