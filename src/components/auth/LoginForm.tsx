'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

import { Button } from '@/components/ui';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { Checkbox } from '@/components/ui';
import { Input, PasswordInput } from '@/components/ui';
import { Label } from '@/components/ui';
import { logger } from '@/lib/logger';

/**
 * "이메일 저장" 은 부가 기능이다. 스토리지가 막힌 환경(사파리 프라이빗 일부 버전,
 * 서드파티 iframe, 기업 정책)에서 `localStorage` 접근은 `SecurityError` 를 던지는데,
 * 그게 로그인 화면의 렌더나 로그인 성공 처리를 끌어내려서는 안 된다.
 * PWARegistration 이 쓰는 것과 같은 패턴으로 삼키고 로그만 남긴다.
 */
function safeStorage<T>(operation: () => T, what: string): T | undefined {
  try {
    return operation();
  } catch (err) {
    logger.error(
      `[Login] localStorage ${what} failed`,
      err instanceof Error ? err : new Error(String(err))
    );
    return undefined;
  }
}

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 컴포넌트 마운트 시 저장된 이메일 불러오기
  useEffect(() => {
    // 스토리지가 막혀 있으면 여기서 던지는 SecurityError 가 로그인 화면 전체를
    // 렌더 불가로 만든다 — 로그인은 복구 불가 지점이라 반드시 삼켜야 한다.
    const savedEmail = safeStorage(() => {
      // 과거 버전이 평문으로 저장한 비밀번호를 무조건 제거합니다 (보안).
      localStorage.removeItem('sr-remembered-password');
      return localStorage.getItem('sr-remembered-email');
    }, 'read');

    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      // 실패 판정은 두 갈래다.
      //  - `result.error` 가 있으면 명백한 실패다.
      //  - `result.ok === false` 도 실패다. NextAuth 는 `{ ok: false, error: null }`
      //    형태를 돌려줄 수 있는데, error 만 보면 인증에 실패했는데도 대시보드로
      //    밀어 넣게 된다.
      // 반대로 `ok` 가 **없는** 경우(=== false 가 아닌 경우)는 실패로 보지 않는다.
      // `signIn` 이 `undefined` 를 돌려주거나 `{ error: null }` 만 돌려주는 경로가
      // 실제로 존재하며, 그걸 실패로 뒤집으면 정상 로그인이 막힌다.
      // 즉 "명시적인 ok:false 만 실패" 라는 보수적인 판정이다.
      const signInFailed = Boolean(result?.error) || result?.ok === false;

      if (signInFailed) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else {
        // 로그인 성공 시 이메일만 저장 또는 삭제 (비밀번호는 저장하지 않음).
        // 저장 실패는 로그인 자체를 실패시켜서는 안 된다 — try/catch 없이 두면
        // 아래 catch 로 떨어져 "로그인 중 오류" 토스트가 뜨고 router.push 도 안 된다.
        safeStorage(() => {
          if (rememberMe) {
            localStorage.setItem('sr-remembered-email', email);
          } else {
            localStorage.removeItem('sr-remembered-email');
          }
        }, 'write');

        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        {/* CardTitle 은 <div> 라 그대로 두면 페이지에 h1 이 없다(axe: page-has-heading-one). */}
        <CardTitle asChild className="text-2xl font-bold">
          <h1>로그인</h1>
        </CardTitle>
        <CardDescription>SR 관리 시스템에 로그인하세요</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div
              className="bg-destructive/15 text-destructive text-sm p-3 rounded-md"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              aria-invalid={!!error}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              aria-invalid={!!error}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="remember"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              disabled={isLoading}
            />
            <Label
              htmlFor="remember"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              이메일 저장
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" isLoading={isLoading}>
            로그인
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            계정이 없으신가요?{' '}
            <Link href="/register" className="text-primary underline underline-offset-4">
              회원가입
            </Link>
          </p>
          {/*
            셀프 서비스 재설정 플로우는 아직 없다. 안내가 없으면 잠긴 사용자는
            복구 수단이 존재한다는 사실 자체를 알 수 없어 막다른 길에 놓인다.
            (관리자 재설정 경로는 사용자 관리 화면에 있다)
          */}
          <p className="text-sm text-muted-foreground text-center">
            비밀번호를 잊으셨나요? 시스템 관리자에게 재설정을 요청하세요.
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
