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

/**
 * 유휴 세션 자동 로그아웃.
 *
 * 29분간 입력이 없으면 경고 모달을 띄우고, 이후 1분간 반응이 없으면 로그아웃한다.
 *
 * 경고 표시 여부를 state 가 아니라 ref(`showWarningRef`)로도 들고 있는 이유:
 * 타이머를 예약하는 `resetTimer` 가 `showWarning` state 에 의존하면,
 * 경고가 뜨는 순간 콜백 신원이 바뀌어 리스너 effect 가 재실행되고,
 * 그 cleanup 이 방금 예약한 로그아웃 타이머를 지워 버린다. 그러면 모달만 뜬 채
 * 자동 로그아웃은 영원히 실행되지 않는다. ref 로 읽으면 `resetTimer` 가 안정적으로
 * 유지되어 effect 가 재실행되지 않는다.
 */
export function IdleTimeoutProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [showWarning, setShowWarning] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 타이머 로직이 참조하는 경고 상태. state 와 항상 함께 갱신한다.
  const showWarningRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }, []);

  const setWarning = useCallback((next: boolean) => {
    showWarningRef.current = next;
    setShowWarning(next);
  }, []);

  const handleLogout = useCallback(async () => {
    setWarning(false);
    clearTimers();

    await signOut({ redirect: false });
    router.push('/login?reason=timeout');
  }, [clearTimers, router, setWarning]);

  const resetTimer = useCallback(() => {
    // 경고 모달이 떠 있는 동안의 활동(마우스 이동 등)은 타이머를 되돌리지 않는다.
    // 되돌리면 사용자가 "계속 유지"를 누르지 않아도 로그아웃이 무한히 연기된다.
    if (showWarningRef.current) return;

    clearTimers();

    idleTimerRef.current = setTimeout(() => {
      setWarning(true);

      // Warning 시간(1분) 동안 반응이 없으면 실제 로그아웃 진행
      warningTimerRef.current = setTimeout(() => {
        void handleLogout();
      }, WARNING_TIMEOUT);
    }, IDLE_TIMEOUT - WARNING_TIMEOUT);
  }, [clearTimers, handleLogout, setWarning]);

  // 세션이 끊기면 타이머와 모달을 정리한다.
  useEffect(() => {
    if (status === 'authenticated') return;
    clearTimers();
    setWarning(false);
  }, [status, clearTimers, setWarning]);

  // 언마운트 시 타이머 누수 방지.
  useEffect(() => clearTimers, [clearTimers]);

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

    // 여기서 타이머를 지우지 않는다. 경로 이동만으로 예약된 로그아웃 타이머가
    // 사라지면 경고 모달 중 페이지를 옮겼을 때 자동 로그아웃이 실행되지 않는다.
    // 타이머 정리는 위의 세션 종료 / 언마운트 effect 가 담당한다.
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [status, pathname, resetTimer]);

  const handleContinue = useCallback(() => {
    setWarning(false);
    resetTimer();
  }, [resetTimer, setWarning]);

  return (
    <>
      {children}
      <AlertDialog
        open={showWarning}
        onOpenChange={(open) => {
          if (!open) handleContinue();
        }}
      >
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
              onClick={() => void handleLogout()}
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
