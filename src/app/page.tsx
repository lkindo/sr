'use client';

import { BarChart3, CheckCircle2, ClipboardList, Loader2, Shield, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">SR Management</span>
          </div>
          <nav className="flex items-center gap-4">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">
              주요 기능
            </a>
            <a href="#auth" className="text-sm text-muted-foreground hover:text-foreground">
              로그인
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            효율적인 서비스 요청 관리
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            SR Management System으로 고객사의 모든 서비스 요청을 체계적으로 관리하고 추적하세요
          </p>
          <div className="flex items-center justify-center gap-4 pt-4">
            <a href="#auth">
              <Button size="lg" className="gap-2">
                시작하기
                <CheckCircle2 className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-16 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">주요 기능</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <ClipboardList className="h-10 w-10 text-primary mb-2" />
                <CardTitle>SR 관리</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  서비스 요청을 생성, 추적, 관리하고 상태별로 분류하여 효율적으로 처리할 수
                  있습니다.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Users className="h-10 w-10 text-primary mb-2" />
                <CardTitle>고객사 관리</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  여러 고객사의 정보를 관리하고, 각 고객사별 서비스 요청을 체계적으로 분류합니다.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-primary mb-2" />
                <CardTitle>실시간 대시보드</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  SR 현황을 실시간으로 확인하고, 통계와 차트로 한눈에 파악할 수 있습니다.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-primary mb-2" />
                <CardTitle>권한 관리</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  역할 기반 접근 제어(RBAC)로 사용자별 권한을 세밀하게 관리할 수 있습니다.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CheckCircle2 className="h-10 w-10 text-primary mb-2" />
                <CardTitle>활동 추적</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  모든 SR의 활동 이력과 댓글을 기록하여 투명한 의사소통을 지원합니다.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <ClipboardList className="h-10 w-10 text-primary mb-2" />
                <CardTitle>첨부파일 관리</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  SR에 관련 문서와 이미지를 첨부하여 상세한 정보를 공유할 수 있습니다.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Auth Section */}
      <section id="auth" className="container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto">
          <LoginCard />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>SR Management System v1.0.0</p>
          <p className="mt-2">© 2024. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function LoginCard() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 컴포넌트 마운트 시 저장된 로그인 정보 불러오기
  useEffect(() => {
    const savedEmail = localStorage.getItem('sr-remembered-email');
    const savedPassword = localStorage.getItem('sr-remembered-password');

    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }

    if (savedPassword) {
      setPassword(savedPassword);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
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
        // 로그인 성공 시 로그인 정보 저장 또는 삭제
        if (rememberMe) {
          localStorage.setItem('sr-remembered-email', email);
          localStorage.setItem('sr-remembered-password', password);
        } else {
          localStorage.removeItem('sr-remembered-email');
          localStorage.removeItem('sr-remembered-password');
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
      <CardHeader>
        <CardTitle>로그인</CardTitle>
        <CardDescription>SR 관리 시스템에 로그인하세요</CardDescription>
      </CardHeader>
      <form onSubmit={handleLogin}>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">{error}</div>
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
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
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
              로그인 정보 저장
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                로그인 중...
              </>
            ) : (
              '로그인'
            )}
          </Button>

          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">또는</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => router.push('/register')}
          >
            새 계정 만들기
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            고객사 담당자 또는 기술 지원팀 계정을 선택하여 가입할 수 있습니다.
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
