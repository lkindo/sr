'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Save, User as UserIcon } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Separator } from '@/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { ApiError, apiGet, apiPatch, apiPost, retryUnlessClientError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { qk } from '@/lib/query-keys';

interface Role {
  role: {
    id: string;
    name: string;
    description?: string;
  };
}

interface Client {
  client: {
    id: string;
    code: string;
    name: string;
  };
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  image?: string;
  isActive: boolean;
  createdAt: string;
  roles: Role[];
  clients: Client[];
}

/**
 * 조회 실패 시 화면과 토스트에 함께 쓰는 문구.
 *
 * 서버가 준 메시지를 쓰지 않는 것은 의도다 — 이 화면은 실패 원인을 구분해 보여 주지 않고
 * 항상 같은 문장을 보여 준다. React Query 로 옮기면서도 그 계약을 그대로 둔다.
 */
const PROFILE_LOAD_ERROR_MESSAGE = '프로필 정보를 불러오는데 실패했습니다.';

export default function ProfilePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [image, setImage] = useState('');

  // 비밀번호 변경
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const {
    data: profile,
    isPending,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.profile.detail,
    queryFn: async () => {
      try {
        // `/api/profile` 은 봉투 없이 단건을 그대로 준다.
        return await apiGet<UserProfile>('/api/profile');
      } catch (err) {
        // 상태코드를 남기던 기존 로그를 유지한다. ApiError 가 아니면(네트워크 오류 등)
        // 상태코드가 없으므로 아래 effect 의 로그만 남는다.
        if (err instanceof ApiError) {
          logger.error('프로필 조회 실패', undefined, { status: err.status });
        }
        throw err;
      }
    },
    retry: retryUnlessClientError,
  });

  // 서버가 준 값을 편집 폼의 초기값으로 옮긴다. React Query 의 structural sharing 덕분에
  // 내용이 같은 재조회는 참조가 유지되므로, 사용자가 입력 중인 값을 덮어쓰지 않는다.
  // 저장 후 무효화로 새 데이터가 들어왔을 때만 다시 동기화된다.
  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setImage(profile.image || '');
  }, [profile]);

  // 조회 실패는 화면(아래 에러 블록)과 토스트 **양쪽**에 나타난다는 것이 기존 동작이다.
  // v5 의 useQuery 에는 onError 가 없으므로 effect 로 옮긴다.
  //
  // 과거 주석은 "toast 를 deps 에 넣었을 때 무한 루프가 관측되어 제외했다" 고 적고 있었다.
  // 그 함수는 use-toast 의 모듈 스코프 함수라 참조가 고정이며, 여기서 루프를 만드는 것은
  // deps 가 아니라 매 렌더 재실행이다. `error` 는 실패마다 새 객체이므로 실패 1회당
  // 정확히 1번 실행된다 — 재시도 버튼으로 다시 실패하면 토스트도 다시 뜬다.
  useEffect(() => {
    if (!error) return;
    logger.error('프로필 조회 오류', error instanceof Error ? error : undefined);
    toast({
      title: '오류',
      description: PROFILE_LOAD_ERROR_MESSAGE,
      variant: 'destructive',
    });
  }, [error, toast]);

  const updateProfile = useMutation({
    mutationFn: (payload: { name: string; image: string }) =>
      // fallbackMessage 는 서버가 `error` 를 주지 않았을 때의 기존 문구와 같다.
      apiPatch<UserProfile>('/api/profile', payload, {
        fallbackMessage: 'Failed to update profile',
      }),
    onSuccess: () => {
      toast({
        title: '성공',
        description: '프로필이 업데이트되었습니다.',
      });
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '프로필 업데이트에 실패했습니다.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      // 예전에는 성공 직후 fetchProfile() 을 다시 불렀다. 무효화가 같은 일을 한다.
      queryClient.invalidateQueries({ queryKey: qk.profile.detail });
    },
  });

  const changePassword = useMutation({
    mutationFn: (payload: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) =>
      apiPost('/api/profile/password', payload, {
        fallbackMessage: 'Failed to change password',
      }),
    onSuccess: () => {
      toast({
        title: '성공',
        description: '비밀번호가 변경되었습니다.',
      });

      // 비밀번호 필드 초기화
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const handleUpdateProfile = () => {
    updateProfile.mutate({ name, image });
  };

  const handleChangePassword = () => {
    // 클라이언트 일치 검증은 호출부에 남긴다 — 서버 요청 없이 끝나는 검사이므로
    // mutation 의 pending 상태를 거치지 않아야 한다(버튼이 깜빡이지 않는다).
    if (newPassword !== confirmPassword) {
      toast({
        title: '오류',
        description: '새 비밀번호가 일치하지 않습니다.',
        variant: 'destructive',
      });
      return;
    }

    changePassword.mutate({ currentPassword, newPassword, confirmPassword });
  };

  // 첫 로딩과 "다시 시도" 재조회에서만 스피너다 — 예전 fetchProfile 이 재시도 때도
  // loading 을 다시 켰기 때문에 그 동작을 유지한다. 데이터가 이미 있는 상태의 재조회
  // (저장 후 무효화)에서는 화면이 깜빡이면 안 되므로 `profile === undefined` 를 함께 건다.
  if (isPending || (isFetching && profile === undefined)) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="sr-loading-spinner mx-auto"></div>
          <p className="text-muted-foreground">프로필 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="text-destructive">
            <h2 className="text-2xl font-bold mb-2">프로필 로드 실패</h2>
            <p className="text-muted-foreground mb-4">
              {error ? PROFILE_LOAD_ERROR_MESSAGE : '프로필 정보를 불러올 수 없습니다.'}
            </p>
          </div>
          <Button
            onClick={() => void refetch()}
            className="bg-[hsl(var(--sr-primary-dark))] hover:bg-[hsl(var(--sr-primary-darker))]"
          >
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  const initials =
    profile.name
      ?.split(' ')
      .map((n) => n[0] ?? '')
      .join('')
      .toUpperCase() || (profile.email[0] ?? '?').toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">프로필</h1>
        <p className="text-muted-foreground">개인 정보를 관리합니다.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* 프로필 카드 */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>프로필 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-4">
              <Avatar className="h-24 w-24">
                <AvatarImage src={profile.image || undefined} />
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
              <div className="text-center">
                <p className="text-lg font-semibold">{profile.name}</p>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
              </div>
              <Badge variant={profile.isActive ? 'default' : 'secondary'}>
                {profile.isActive ? '활성' : '비활성'}
              </Badge>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-2">역할</h3>
              <div className="flex flex-wrap gap-2">
                {profile.roles.length > 0 ? (
                  profile.roles.map((userRole) => (
                    <Badge key={userRole.role.id} variant="secondary">
                      {userRole.role.name}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">역할 없음</p>
                )}
              </div>
            </div>

            {profile.clients.length > 0 && !profile.roles.some((r) => r.role.name === 'ADMIN') && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium mb-2">소속 고객사</h3>
                  <div className="space-y-1">
                    {profile.clients.map((userClient) => (
                      <div key={userClient.client.id} className="text-sm">
                        <span className="font-medium">{userClient.client.name}</span>
                        <span className="text-muted-foreground ml-2">
                          ({userClient.client.code})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div className="text-xs text-muted-foreground">
              <p>가입일: {new Date(profile.createdAt).toLocaleDateString('ko-KR')}</p>
            </div>
          </CardContent>
        </Card>

        {/* 설정 탭 */}
        <Card className="md:col-span-2">
          <CardContent className="pt-6">
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="profile">
                  <UserIcon className="h-4 w-4 mr-2" />
                  기본 정보
                </TabsTrigger>
                <TabsTrigger value="security">
                  <Lock className="h-4 w-4 mr-2" />
                  보안
                </TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-4 mt-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">기본 정보 수정</h3>
                  <p className="text-sm text-muted-foreground mb-4">이름을 변경할 수 있습니다.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">이름</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="이름을 입력하세요"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">이메일</Label>
                    <Input id="email" value={profile.email} disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground">이메일은 변경할 수 없습니다.</p>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button onClick={handleUpdateProfile} disabled={updateProfile.isPending}>
                      <Save className="mr-2 h-4 w-4" />
                      {updateProfile.isPending ? '저장 중...' : '저장'}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="security" className="space-y-4 mt-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">비밀번호 변경</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    보안을 위해 주기적으로 비밀번호를 변경하는 것을 권장합니다.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">현재 비밀번호</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="현재 비밀번호를 입력하세요"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">새 비밀번호</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="새 비밀번호를 입력하세요 (최소 6자)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="새 비밀번호를 다시 입력하세요"
                    />
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button
                      onClick={handleChangePassword}
                      disabled={
                        changePassword.isPending ||
                        !currentPassword ||
                        !newPassword ||
                        !confirmPassword
                      }
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      {changePassword.isPending ? '변경 중...' : '비밀번호 변경'}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
