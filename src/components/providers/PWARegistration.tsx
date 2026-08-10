'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

import { Button } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

/**
 * 모바일 기기 감지 함수
 * PC에서는 PWA 기능을 비활성화하기 위해 사용
 */
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // User Agent 기반 감지
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;

  // iPad는 iPadOS 13+에서 desktop mode를 사용하므로 별도로 체크
  const isIpad =
    /iPad/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  return mobileRegex.test(userAgent) || isIpad;
}

export function PWARegistration() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // PC에서는 PWA 기능을 완전히 비활성화
    if (!isMobileDevice()) {
      return;
    }

    // 1. Service Worker 등록 (모바일에서만 실행)
    const registerSW = () => {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            logger.info(`[PWA] Service Worker registered with scope: ${registration.scope}`);
          })
          .catch((error) => {
            logger.error(
              '[PWA] Service Worker registration failed',
              error instanceof Error ? error : new Error(String(error))
            );
          });
      }
    };

    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
    }

    // 2. 설치 프로모션 이벤트 캡처 (모바일에서만 실행)
    //
    // 순서가 중요하다. `preventDefault()` 는 브라우저의 **네이티브 설치 프롬프트를
    // 억제**하는 행위이지 "우리가 이벤트를 쓰겠다" 는 표시가 아니다. 예전 구현은
    // 유예 검사보다 먼저 preventDefault() 를 불러서, 배너를 한 번 닫은 사용자에게
    // 7일 동안 우리 배너도 네이티브 프롬프트도 뜨지 않는 — 앱을 설치할 방법이
    // 아예 없는 — 상태를 만들었다.
    // 따라서 유예 검사를 먼저 하고, **배너를 띄우기로 결정한 경우에만** 억제한다.
    // 유예 중에는 아무것도 하지 않고 반환해 네이티브 프롬프트에 길을 내준다.
    const handleBeforeInstallPrompt = (e: any) => {
      // 배너 유예 기간 확인 (7일 유예)
      try {
        const dismissedAt = localStorage.getItem('pwa-banner-dismissed-at');
        if (dismissedAt) {
          const lastDismissed = parseInt(dismissedAt, 10);
          if (!isNaN(lastDismissed)) {
            const now = Date.now();
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

            if (now - lastDismissed <= sevenDaysInMs) {
              // 7일 이내라면 우리 배너는 띄우지 않는다. preventDefault() 를 부르지
              // 않으므로 브라우저가 자체 설치 UI 를 그대로 띄울 수 있다.
              return;
            }
          }
        }
      } catch (err) {
        // 스토리지를 못 읽으면 유예 여부를 알 수 없다 — 배너를 띄우는 쪽으로 간다.
        logger.error(
          '[PWA] Error checking dismissed status',
          err instanceof Error ? err : new Error(String(err))
        );
      }

      // 배너를 띄우기로 확정된 시점에만 네이티브 프롬프트를 억제한다.
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('load', registerSW);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    setInstallPrompt(null);
    setShowInstallBanner(false);

    if (outcome === 'accepted') {
      toast({
        title: '설치가 시작되었습니다',
        description: '잠시 후 앱 목록에서 확인하실 수 있습니다.',
      });
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-banner-dismissed-at', Date.now().toString());
    setShowInstallBanner(false);
  };

  if (!showInstallBanner) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-auto max-w-xs">
      <div className="bg-[hsl(var(--sr-primary-dark))] p-3 rounded-lg shadow-2xl border border-[#3f4564] text-white animate-in slide-in-from-bottom-5 duration-500">
        <div className="flex items-center gap-3">
          <div className="bg-[hsl(var(--sr-accent-orange))] p-2 rounded-md shrink-0">
            <Download className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold">앱으로 설치</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              className="bg-card text-[hsl(var(--sr-primary-dark))] hover:bg-muted h-7 px-2 text-xs"
              onClick={handleInstallClick}
            >
              설치
            </Button>
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-white transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
