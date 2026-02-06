'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

import { Button } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export function PWARegistration() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // 1. Service Worker 등록 (상시 실행)
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

    // 2. 설치 프로모션 이벤트 캡처 (상시 실행)
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();

      // 배너 유예 기간 확인 (7일 유예)
      try {
        const dismissedAt = localStorage.getItem('pwa-banner-dismissed-at');
        if (dismissedAt) {
          const lastDismissed = parseInt(dismissedAt, 10);
          if (!isNaN(lastDismissed)) {
            const now = Date.now();
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

            if (now - lastDismissed <= sevenDaysInMs) {
              return; // 7일 이내라면 배너를 띄우지 않음
            }
          }
        }
      } catch (err) {
        logger.error(
          '[PWA] Error checking dismissed status',
          err instanceof Error ? err : new Error(String(err))
        );
      }

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
              className="bg-white text-[hsl(var(--sr-primary-dark))] hover:bg-gray-100 h-7 px-2 text-xs"
              onClick={handleInstallClick}
            >
              설치
            </Button>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
