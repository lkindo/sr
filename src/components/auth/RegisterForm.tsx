'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Info,
  Loader2,
  Users,
  Wrench,
  X,
} from 'lucide-react';

import { registerUser } from '@/app/(auth)/register/actions'; // import 경로 수정
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui';
import { Button } from '@/components/ui';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { Input, PasswordInput } from '@/components/ui';
import { Label } from '@/components/ui';
import { RadioGroup, RadioGroupItem } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { apiList, retryUnlessClientError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { ClientSummary } from '@/types/client.types';

/** `calculatePasswordStrength` 가 돌려주는 개별 규칙 충족 여부. */
interface PasswordChecks {
  length: boolean;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  special: boolean;
}

/**
 * 비밀번호 요구사항의 **표시 순서**.
 *
 * `calculatePasswordStrength` 의 `checks` 객체는 lowercase 를 uppercase 보다 먼저
 * 선언하는데 화면은 대문자를 먼저 보여준다. 그래서 `Object.entries(checks)` 로
 * 순회하면 두 줄의 순서가 조용히 뒤바뀐다. 순서는 여기서 명시한다.
 */
function passwordRequirements(checks: PasswordChecks) {
  return [
    { key: 'length', label: '최소 8자 이상', met: checks.length },
    { key: 'uppercase', label: '대문자 포함', met: checks.uppercase },
    { key: 'lowercase', label: '소문자 포함', met: checks.lowercase },
    { key: 'number', label: '숫자 포함', met: checks.number },
    { key: 'special', label: '특수문자 포함 (@$!%*?&#)', met: checks.special },
  ];
}

/** 요구사항 한 줄. 충족 여부에 따라 아이콘과 색만 달라진다. */
function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {met ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <X className="h-3 w-3 text-muted-foreground" />
      )}
      <span className={met ? 'text-green-600' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

// 비밀번호 강도 계산 함수
function calculatePasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
  checks: {
    length: boolean;
    lowercase: boolean;
    uppercase: boolean;
    number: boolean;
    special: boolean;
  };
} {
  const checks = {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[@$!%*?&#]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;

  let label = '매우 약함';
  let color = 'bg-red-500';

  if (score === 5) {
    label = '매우 강함';
    color = 'bg-green-500';
  } else if (score === 4) {
    label = '강함';
    color = 'bg-blue-500';
  } else if (score === 3) {
    label = '보통';
    color = 'bg-yellow-500';
  } else if (score >= 1) {
    label = '약함';
    color = 'bg-orange-500';
  }

  return { score: (score / 5) * 100, label, color, checks };
}

export default function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 새로운 상태
  const [accountType, setAccountType] = useState<'ENGINEER' | 'CLIENT'>('CLIENT');
  const [selectedClientId, setSelectedClientId] = useState('');

  // 비밀번호 강도 상태
  const [password, setPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(calculatePasswordStrength(''));

  /**
   * 고객사 목록 (회원가입용 무인증 공개 라우트).
   *
   * 기본 계정 유형이 CLIENT 라 마운트 시 곧바로 필요하다. 예전에는 `useEffect` +
   * `fetch` 로 직접 받아오면서 `if (clients.length > 0) return` 자기참조 가드와
   * `[clients.length]` 의존성으로 "한 번만 로드" 를 흉내 냈다. 그 캐싱은 이제 React
   * Query 가 한다 — 마운트와 계정 유형 전환이 같은 키를 보므로 요청은 한 번뿐이고,
   * 가드도 deps 도 필요 없다.
   *
   * 이 목록은 거의 바뀌지 않으므로 staleTime 을 길게 준다(전역 기본값은 1분).
   */
  const { data: clients = [], isPending: loadingClients } = useQuery({
    queryKey: qk.clients.publicList,
    // 이 라우트는 bare 배열을 돌려준다. `apiList` 가 봉투/bare 양쪽을 받아 주므로
    // 예전의 `Array.isArray(result) ? result : result.data || []` 분기는 불필요하다.
    queryFn: async () => (await apiList<ClientSummary>('/api/clients/public')).data,
    staleTime: 5 * 60 * 1000,
    retry: retryUnlessClientError,
  });
  // 실패는 화면에 노출하지 않는다(계약). `error` 를 읽지 않으면 clients 가 빈 배열로
  // 남아 아래의 "등록된 고객사가 없습니다" 안내가 그대로 뜬다 — 회원가입 화면에
  // 토스트를 새로 띄우는 것은 회귀다.

  const handleAccountTypeChange = (value: 'ENGINEER' | 'CLIENT') => {
    setAccountType(value);
    if (value !== 'CLIENT') {
      setSelectedClientId(''); // ENGINEER로 변경 시 선택 초기화
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    setPasswordStrength(calculatePasswordStrength(newPassword));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 고객사 담당자인데 고객사 미선택 시 에러
    if (accountType === 'CLIENT' && !selectedClientId) {
      setError('소속 고객사를 선택해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData(e.currentTarget);

      // 계정 유형 및 고객사 정보 추가
      formData.append('accountType', accountType);
      if (accountType === 'CLIENT' && selectedClientId) {
        formData.append('clientId', selectedClientId);
      }

      const result = await registerUser(formData);

      if (result.success) {
        setSuccess(result.message || '');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        setError(result.error || '');
      }
    } catch {
      setError('회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* 헤더 섹션 - 로고 및 뒤로가기 */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          로그인으로 돌아가기
        </Link>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">SR Management</span>
        </div>
      </div>

      <Card className="w-full">
        <CardHeader className="space-y-1">
          {/* CardTitle 은 <div> 라 그대로 두면 페이지에 h1 이 없다(axe: page-has-heading-one). */}
          <CardTitle asChild className="text-2xl font-bold">
            <h1>회원가입</h1>
          </CardTitle>
          <CardDescription>새 계정을 만들어 SR 관리 시스템을 사용하세요</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>오류</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className="border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertTitle>성공</AlertTitle>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            {/* 섹션 1: 기본 정보 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="홍길동"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <PasswordInput
                  id="password"
                  name="password"
                  placeholder="최소 8자 이상"
                  required
                  disabled={isLoading}
                  value={password}
                  onChange={handlePasswordChange}
                />

                {/* 비밀번호 강도 표시기 */}
                {password && (
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">비밀번호 강도:</span>
                      <span
                        className={`font-medium ${
                          passwordStrength.score === 100
                            ? 'text-green-600'
                            : passwordStrength.score >= 60
                              ? 'text-blue-600'
                              : passwordStrength.score >= 40
                                ? 'text-yellow-600'
                                : 'text-red-600'
                        }`}
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                        style={{ width: `${passwordStrength.score}%` }}
                      />
                    </div>

                    {/* 비밀번호 요구사항 체크리스트 */}
                    <div className="grid grid-cols-1 gap-1 mt-2">
                      {passwordRequirements(passwordStrength.checks).map(({ key, label, met }) => (
                        <PasswordRequirement key={key} met={met} label={label} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">비밀번호 확인</Label>
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder="비밀번호를 다시 입력하세요"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* 구분선 */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">계정 유형 선택</span>
              </div>
            </div>

            {/* 섹션 2: 계정 유형 선택 */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">어떤 계정으로 가입하시겠습니까?</Label>
              <RadioGroup
                value={accountType}
                onValueChange={handleAccountTypeChange}
                className="grid grid-cols-2 gap-4"
                disabled={isLoading}
              >
                <div>
                  <RadioGroupItem value="CLIENT" id="client" className="peer sr-only" />
                  <Label
                    htmlFor="client"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-5 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                  >
                    <Users className="h-8 w-8 mb-2 text-primary" />
                    <span className="text-sm font-medium">고객사 담당자</span>
                    <span className="text-xs text-muted-foreground mt-1 text-center">
                      SR 요청 및 진행 상황 확인
                    </span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="ENGINEER" id="engineer" className="peer sr-only" />
                  <Label
                    htmlFor="engineer"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-5 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                  >
                    <Wrench className="h-8 w-8 mb-2 text-primary" />
                    <span className="text-sm font-medium">기술 지원팀</span>
                    <span className="text-xs text-muted-foreground mt-1 text-center">
                      SR 처리 및 기술 지원
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* 고객사 선택 (CLIENT 유형일 때만 표시) */}
            {accountType === 'CLIENT' && (
              <div className="space-y-2">
                <Label htmlFor="client-select">
                  소속 고객사 <span className="text-destructive">*</span>
                </Label>
                {loadingClients ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-md">
                    <InlineSpinner />
                    고객사 목록 로딩 중...
                  </div>
                ) : clients.length === 0 ? (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      등록된 고객사가 없습니다. 관리자에게 문의하세요.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Select
                    value={selectedClientId}
                    onValueChange={setSelectedClientId}
                    disabled={isLoading}
                  >
                    <SelectTrigger id="client-select">
                      <SelectValue placeholder="소속 고객사를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name} ({client.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  소속 고객사가 목록에 없다면 관리자에게 문의하세요.
                </p>
              </div>
            )}

            {/* 기술 지원팀 안내 (ENGINEER 유형일 때만 표시) */}
            {accountType === 'ENGINEER' && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  기술 지원팀 계정은 <strong>관리자 승인</strong>이 필요합니다.
                  <br />
                  회원가입 후 관리자가 역할과 권한을 부여할 때까지 기다려주세요.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || (accountType === 'CLIENT' && !selectedClientId)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  회원가입 중...
                </>
              ) : (
                '회원가입'
              )}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              이미 계정이 있으신가요?{' '}
              <Link href="/login" className="text-primary underline underline-offset-4 font-medium">
                로그인
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
