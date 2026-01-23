'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

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
            console.log('[PWA] Service Worker registered with scope:', registration.scope);
          })
          .catch((error) => {
            console.error('[PWA] Service Worker registration failed:', error);
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
      const dismissedAt = localStorage.getItem('pwa-banner-dismissed-at');
      if (dismissedAt) {
        const lastDismissed = new Date(parseInt(dismissedAt, 10));
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - lastDismissed.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 7) {
          return;
        }
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
    <div className="fixed bottom-4 left-4 right-4 z-[100] md:left-auto md:right-8 md:bottom-8 md:w-80">
      <div className="bg-[hsl(var(--sr-primary-dark))] p-4 rounded-lg shadow-2xl border border-[#3f4564] text-white flex items-center justify-between gap-4 animate-in slide-in-from-bottom-5 duration-500">
        <div className="flex items-center gap-3">
          <div className="bg-[hsl(var(--sr-accent-orange))] p-2 rounded-md">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold">홈 화면에 추가</p>
            <p className="text-xs text-gray-400">앱으로 설치하여 더 편하게 관리하세요.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="bg-white text-[hsl(var(--sr-primary-dark))] hover:bg-gray-100 h-8 px-3"
            onClick={handleInstallClick}
          >
            설치
          </Button>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
