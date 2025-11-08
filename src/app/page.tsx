"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ClipboardList, 
  Users, 
  BarChart3, 
  Shield,
  CheckCircle2,
  Loader2
} from "lucide-react";

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
            SR Management System으로 고객사의 모든 서비스 요청을 
            체계적으로 관리하고 추적하세요
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
                  서비스 요청을 생성, 추적, 관리하고 상태별로 분류하여 
                  효율적으로 처리할 수 있습니다.
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
                  여러 고객사의 정보를 관리하고, 각 고객사별 서비스 요청을 
                  체계적으로 분류합니다.
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
                  SR 현황을 실시간으로 확인하고, 통계와 차트로 
                  한눈에 파악할 수 있습니다.
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
                  역할 기반 접근 제어(RBAC)로 사용자별 권한을 
                  세밀하게 관리할 수 있습니다.
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
                  모든 SR의 활동 이력과 댓글을 기록하여 
                  투명한 의사소통을 지원합니다.
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
                  SR에 관련 문서와 이미지를 첨부하여 
                  상세한 정보를 공유할 수 있습니다.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Auth Section */}
      <section id="auth" className="container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto">
          <AuthTabs />
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

function AuthTabs() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Login State
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Register State
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      const result = await signIn("credentials", {
        email: loginEmail,
        password: loginPassword,
        redirect: false,
      });

      if (result?.error) {
        setLoginError("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (error) {
      setLoginError("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRegisterError("");
    setRegisterSuccess("");
    setRegisterLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const name = formData.get("name") as string;
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "회원가입에 실패했습니다.");
      }

      setRegisterSuccess("회원가입이 완료되었습니다. 로그인 해주세요.");
      setTimeout(() => {
        setActiveTab("login");
      }, 2000);
    } catch (error) {
      setRegisterError(
        error instanceof Error ? error.message : "회원가입 중 오류가 발생했습니다."
      );
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "register")}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="login">로그인</TabsTrigger>
        <TabsTrigger value="register">회원가입</TabsTrigger>
      </TabsList>

      <TabsContent value="login">
        <Card>
          <CardHeader>
            <CardTitle>로그인</CardTitle>
            <CardDescription>
              SR 관리 시스템에 로그인하세요
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {loginError && (
                <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
                  {loginError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="login-email">이메일</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="name@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  disabled={loginLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">비밀번호</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  disabled={loginLoading}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    로그인 중...
                  </>
                ) : (
                  "로그인"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </TabsContent>

      <TabsContent value="register">
        <Card>
          <CardHeader>
            <CardTitle>회원가입</CardTitle>
            <CardDescription>
              새 계정을 만들어 SR 관리 시스템을 사용하세요
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleRegister}>
            <CardContent className="space-y-4">
              {registerError && (
                <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
                  {registerError}
                </div>
              )}
              {registerSuccess && (
                <div className="bg-green-500/15 text-green-700 dark:text-green-400 text-sm p-3 rounded-md">
                  {registerSuccess}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="register-name">이름</Label>
                <Input
                  id="register-name"
                  name="name"
                  type="text"
                  placeholder="홍길동"
                  required
                  disabled={registerLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-email">이메일</Label>
                <Input
                  id="register-email"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  disabled={registerLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">비밀번호</Label>
                <Input
                  id="register-password"
                  name="password"
                  type="password"
                  placeholder="최소 8자 이상"
                  required
                  disabled={registerLoading}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={registerLoading}
              >
                {registerLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    회원가입 중...
                  </>
                ) : (
                  "회원가입"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
