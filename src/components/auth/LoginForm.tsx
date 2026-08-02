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

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 컴포넌트 마운트 시 저장된 이메일 불러오기
  useEffect(() => {
    // 과거 버전이 평문으로 저장한 비밀번호를 무조건 제거합니다 (보안).
    localStorage.removeItem('sr-remembered-password');

    const savedEmail = localStorage.getItem('sr-remembered-email');

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

      if (result?.error) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else {
        // 로그인 성공 시 이메일만 저장 또는 삭제 (비밀번호는 저장하지 않음)
        if (rememberMe) {
          localStorage.setItem('sr-remembered-email', email);
        } else {
          localStorage.removeItem('sr-remembered-email');
        }

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
        <CardTitle className="text-2xl font-bold">로그인</CardTitle>
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
            <Link href="/register" className="text-primary hover:underline">
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
