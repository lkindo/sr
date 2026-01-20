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
    // 1. Service Worker 등록
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('[PWA] Service Worker registered with scope:', registration.scope);
          })
          .catch((error) => {
            console.error('[PWA] Service Worker registration failed:', error);
          });
      });
    }

    // 2. 설치 프로모션 이벤트 캡처
    const handleBeforeInstallPrompt = (e: any) => {
      // 브라우저 기본 설치 안내 방지
      e.preventDefault();
      // 이벤트를 저장해두었다가 나중에 실행
      setInstallPrompt(e);
      // 설치 안내 UI 표시
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    // 설치 프롬프트 표시
    installPrompt.prompt();

    // 사용자의 응답 대기
    const { outcome } = await installPrompt.userChoice;
    console.log(`[PWA] User choice: ${outcome}`);

    // 프롬프트는 한 번만 사용 가능하므로 초기화
    setInstallPrompt(null);
    setShowInstallBanner(false);

    if (outcome === 'accepted') {
      toast({
        title: '설치가 시작되었습니다',
        description: '잠시 후 앱 목록에서 확인하실 수 있습니다.',
      });
    }
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
            onClick={() => setShowInstallBanner(false)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
