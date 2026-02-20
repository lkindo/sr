'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui';

// 30분 유휴 (밀리초)
const IDLE_TIMEOUT = 30 * 60 * 1000;
// 1분간 카운트다운 모달 노출 시간
const WARNING_TIMEOUT = 1 * 60 * 1000;

export function IdleTimeoutProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [showWarning, setShowWarning] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = useCallback(() => {
    if (status !== 'authenticated') return;
    if (showWarning) return; // 모달이 뜬 상태에서는 리셋 금지

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    idleTimerRef.current = setTimeout(() => {
      setShowWarning(true);

      // Warning 시간(1분) 동안 반응이 없으면 실제 로그아웃 진행
      warningTimerRef.current = setTimeout(() => {
        handleLogout();
      }, WARNING_TIMEOUT);
    }, IDLE_TIMEOUT - WARNING_TIMEOUT);
  }, [status, showWarning]);

  useEffect(() => {
    // 로그인 페이지 등에서는 동작하지 않음
    if (status !== 'authenticated' || pathname.startsWith('/login')) {
      return;
    }

    const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
    events.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    resetTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [status, pathname, resetTimer]);

  const handleLogout = async () => {
    setShowWarning(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    await signOut({ redirect: false });
    router.push('/login?reason=timeout');
  };

  const handleContinue = () => {
    setShowWarning(false);
    resetTimer();
  };

  return (
    <>
      {children}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>세션 만료 경고</AlertDialogTitle>
            <AlertDialogDescription>
              장시간 활동이 없어 잠시 후 자동으로 로그아웃됩니다. 계속 로그인 상태를
              유지하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              로그아웃
            </AlertDialogAction>
            <AlertDialogAction onClick={handleContinue}>계속 유지</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
