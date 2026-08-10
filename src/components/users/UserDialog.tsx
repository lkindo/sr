'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui';
import { Checkbox } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { apiList, apiPatch, apiPost, buildQuery, retryUnlessClientError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { qk } from '@/lib/query-keys';
import { passwordSchema } from '@/lib/schemas';
import type { ClientSummary } from '@/types/client.types';

/** 서버 `passwordSchema` 가 실제로 요구하는 규칙. 입력 힌트와 검증을 한 곳에서 맞춘다. */
const PASSWORD_RULE_HINT = '8자 이상, 대문자·소문자·숫자·특수문자 각 1개 이상';

/**
 * 고객사 목록 조회 파라미터.
 *
 * 한 객체에서 queryKey 와 URL 을 함께 파생시킨다 — 둘이 따로 적히면 캐시 키와 실제로 부른
 * 주소가 조용히 어긋난다. `pageSize` 를 크게 잡는 이유는 예전 그대로다: 이 다이얼로그는
 * 페이지네이션 UI 없이 전체 고객사를 한 번에 보여 준다.
 */
const CLIENT_LIST_PARAMS = { pageSize: 100 } as const;

/** 조회 실패 시 쓰는 문구. 서버 메시지를 쓰지 않는 것은 기존 계약 그대로다. */
const CLIENTS_LOAD_ERROR_MESSAGE = '고객사 목록을 불러오는데 실패했습니다.';

/** 저장 요청 본문. 서버가 부분 갱신을 받으므로 전부 선택 필드다. */
interface UserPayload {
  name?: string;
  email?: string;
  password?: string;
  isActive?: boolean;
  userType?: string;
  roleIds?: string[];
  clientIds?: string[];
}

interface User {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles?: Array<{
    role: {
      id: string;
      name: string;
      description?: string | null;
    };
  }>;
  clients?: Array<{
    client: ClientSummary;
  }>;
}

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSaved: () => void;
  defaultClientId?: string;
  clients?: ClientSummary[];
}

export function UserDialog({
  open,
  onOpenChange,
  user,
  onSaved,
  defaultClientId,
  clients: propClients,
}: UserDialogProps) {
  // ... (state definitions)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [userType, setUserType] = useState<'ENGINEER' | 'CLIENT'>('ENGINEER');
  // 기술 지원팀(ENGINEER): 멀티 선택
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  // 고객사 담당자(CLIENT): 단일 선택(소속 고객사)
  const [selectedClientId, setSelectedClientId] = useState<string>('');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isEditMode = !!user;

  /**
   * 고객사 목록.
   *
   * 예전에는 `useState` 사본 + "prop 이 바뀌면 사본을 덮어쓰는" effect 로 두 벌을 굴렸다.
   * 사본이 필요했던 이유는 fetch 결과를 담을 곳이 있어야 했기 때문인데, 그 자리를 이제
   * React Query 가 맡으므로 사본과 동기화 effect 를 함께 지운다. prop 이 있으면 prop 이
   * 곧 값이다.
   *
   * ⚠️ 봉투/bare 분기(`Array.isArray(result) ? result : result.data || []`)는 `apiList` 가
   * 흡수했다. 그 아래 있던 "형식이 올바르지 않습니다" 토스트는 **도달할 수 없는 가지**였다 —
   * 삼항식의 세 갈래가 모두 배열이라 바로 뒤의 `Array.isArray` 가 항상 참이었다. 사라진
   * 것은 죽은 코드이지 동작이 아니다.
   */
  const {
    data: fetchedClients = [],
    isPending: clientsPending,
    error: clientsError,
  } = useQuery({
    queryKey: qk.clients.list(CLIENT_LIST_PARAMS),
    queryFn: async () =>
      (await apiList<ClientSummary>(`/api/clients${buildQuery(CLIENT_LIST_PARAMS)}`)).data,
    // 예전 effect 의 `open && !propClients` 가드를 그대로 옮긴 것이다.
    enabled: open && !propClients,
    // 다이얼로그를 닫았다 열 때마다 다시 조회하던 동작을 유지한다. 전역 기본값 60초를 그대로
    // 두면 방금 만든 고객사가 선택지에 안 잡힌다.
    staleTime: 0,
    retry: retryUnlessClientError,
  });

  const clients = propClients ?? fetchedClients;
  // prop 으로 받았을 때는 조회 자체가 없으므로 로딩도 없다. 쿼리가 disabled 인 동안
  // `isPending` 은 계속 true 이므로 여기서 걸러 주지 않으면 영영 "로딩 중" 이 남는다.
  const loadingClients = !propClients && clientsPending;

  // 실패는 토스트로만 알리고 목록은 빈 채로 둔다(= 예전 catch 의 `setClients([])`).
  // v5 의 useQuery 에는 onError 가 없어 effect 로 옮긴다. `error` 는 실패마다 새 객체이므로
  // 실패 1회당 정확히 한 번 뜬다 — 기존 catch 와 같은 횟수다.
  useEffect(() => {
    if (!clientsError) return;
    logger.error(
      'Error fetching clients',
      clientsError instanceof Error ? clientsError : new Error(String(clientsError))
    );
    toast({
      title: '오류',
      description: CLIENTS_LOAD_ERROR_MESSAGE,
      variant: 'destructive',
    });
  }, [clientsError, toast]);

  const toggleClient = (clientId: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  };

  useEffect(() => {
    if (open) {
      if (user) {
        setName(user.name);
        setEmail(user.email);
        setIsActive(user.isActive);
        setPassword('');
        setConfirmPassword('');

        // 사용자 유형 및 고객사 설정
        const userClients = user.clients || [];
        const initialIds = userClients.map((uc) => uc.client.id);
        // 역할 기반 사용자유형 판별 우선순위:
        // 기술 지원팀: ENGINEER, MANAGER
        // 고객사 담당자: CLIENT_ADMIN, CLIENT_USER
        const roleNames = (user.roles || []).map((ur) => ur.role.name.toUpperCase());
        const isEngineer = roleNames.includes('ENGINEER') || roleNames.includes('MANAGER');
        const isClient = roleNames.includes('CLIENT_ADMIN') || roleNames.includes('CLIENT_USER');
        const inferredType: 'ENGINEER' | 'CLIENT' = isEngineer
          ? 'ENGINEER'
          : isClient
            ? 'CLIENT'
            : initialIds.length > 0
              ? 'CLIENT'
              : 'ENGINEER';
        setUserType(inferredType);
        setSelectedClientIds(initialIds);
        setSelectedClientId(initialIds[0] ?? '');
      } else {
        setName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setIsActive(true);
        // defaultClientId가 있으면 CLIENT 유형으로, 없으면 ENGINEER 유형으로
        setUserType(defaultClientId ? 'CLIENT' : 'ENGINEER');
        setSelectedClientIds(defaultClientId ? [defaultClientId] : []);
        setSelectedClientId(defaultClientId || '');
      }
    }
  }, [open, user, defaultClientId]);

  /**
   * 생성/수정 저장.
   *
   * url·method 를 `isEditMode` 로 동시에 분기하던 것을 `apiPost`/`apiPatch` 두 갈래로 나눴다.
   * `user` 를 그대로 좁히므로 `user!.id` 같은 단언이 필요 없다(`isEditMode` 는 `!!user` 다).
   *
   * `fallbackMessage` 는 서버가 `error` 를 주지 않았을 때의 기존 문구와 같은 값이다 —
   * 예전 코드의 `error.error || 'Failed to save user'` 를 그대로 옮긴 것이다.
   */
  const saveUser = useMutation({
    mutationFn: (payload: UserPayload) =>
      user
        ? apiPatch<unknown>(`/api/users/${user.id}`, payload, {
            fallbackMessage: 'Failed to save user',
          })
        : apiPost<unknown>('/api/users', payload, { fallbackMessage: 'Failed to save user' }),
    onSuccess: () => {
      toast({
        title: '성공',
        description: `사용자가 ${isEditMode ? '수정' : '생성'}되었습니다.`,
      });

      // 부모(사용자 목록/고객사 상세)는 아직 마이그레이션되지 않아 이 콜백으로 재조회한다.
      // prop 계약을 그대로 둔다 — 순서(토스트 → onSaved → 닫기)도 예전과 같다.
      onSaved();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '사용자 저장에 실패했습니다.',
        variant: 'destructive',
      });
      // 닫지 않는다. 입력한 내용을 잃지 않고 고쳐서 다시 보낼 수 있어야 한다.
    },
    onSettled: () => {
      // 부모가 클라이언트 쿼리로 옮겨지면 이 무효화가 `onSaved` 를 대신한다. 그 전까지는
      // 등록된 쿼리가 없어 무동작이므로 지금 넣어 두어도 요청이 늘지 않는다.
      queryClient.invalidateQueries({ queryKey: qk.users.all });
    },
  });

  const loading = saveUser.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (name.length < 2) {
      toast({
        title: '오류',
        description: '이름은 최소 2자 이상이어야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    // 서버(`passwordSchema`)와 같은 규칙으로 미리 걸러 준다.
    // 예전에는 여기서 "최소 8자"만 보고 통과시켜, 서버 거절 사유를 사용자가 알 수 없었다.
    if (!isEditMode || password) {
      const passwordCheck = passwordSchema.safeParse(password);
      if (!passwordCheck.success) {
        toast({
          title: '오류',
          description: passwordCheck.error.issues[0]?.message ?? PASSWORD_RULE_HINT,
          variant: 'destructive',
        });
        return;
      }
    }

    if (password !== confirmPassword) {
      toast({
        title: '오류',
        description: '비밀번호가 일치하지 않습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (userType === 'CLIENT' && !selectedClientId) {
      toast({
        title: '오류',
        description: 'SR 요청자는 소속 고객사를 선택해야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    const payload: UserPayload = {
      name,
      email,
      isActive,
      userType,
      clientIds:
        userType === 'CLIENT' ? (selectedClientId ? [selectedClientId] : []) : selectedClientIds,
    };

    // 빈 비밀번호를 실어 보내면 서버가 그것으로 덮어쓸 수 있다. 수정 모드에서 비워 둔 경우다.
    if (password) {
      payload.password = password;
    }

    saveUser.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? '사용자 수정' : '새 사용자 추가'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? '사용자 정보를 수정합니다.'
              : '새 사용자를 생성합니다. 모든 필드는 필수입니다.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">이름 *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="사용자 이름"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">이메일 *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="userType">사용자 유형 *</Label>
              <Select
                value={userType}
                onValueChange={(value: 'ENGINEER' | 'CLIENT') => {
                  setUserType(value);
                  if (value === 'ENGINEER') {
                    setSelectedClientId('');
                    // ENGINEER는 멀티선택 허용(초기화는 유지)
                  } else {
                    // CLIENT 전환 시 첫 고객사 기본 지정
                    setSelectedClientId((prev) => prev || (selectedClientIds[0] ?? ''));
                  }
                }}
                disabled={loading}
              >
                <SelectTrigger id="userType">
                  <SelectValue placeholder="사용자 유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENGINEER">기술 지원팀</SelectItem>
                  <SelectItem value="CLIENT">고객사 담당자</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {userType === 'CLIENT' && (
              <div className="space-y-2">
                <Label>소속 고객사 *</Label>
                {loadingClients ? (
                  <p className="text-sm text-muted-foreground">고객사 목록 로딩 중...</p>
                ) : (
                  <>
                    {clients.length === 0 ? (
                      <p className="text-sm text-muted-foreground">등록된 고객사가 없습니다.</p>
                    ) : (
                      <Select
                        value={selectedClientId}
                        onValueChange={(val) => setSelectedClientId(val)}
                        disabled={loading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="소속 고객사 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Array.isArray(clients) ? clients : []).map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name} ({client.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                )}
              </div>
            )}

            {userType === 'ENGINEER' && (
              <div className="space-y-2">
                <Label>할당 고객사 (복수 선택 가능)</Label>
                {loadingClients ? (
                  <p className="text-sm text-muted-foreground">고객사 목록 로딩 중...</p>
                ) : (
                  <div className="border rounded-md p-4 space-y-2 max-h-60 overflow-y-auto">
                    {clients.length === 0 ? (
                      <p className="text-sm text-muted-foreground">등록된 고객사가 없습니다.</p>
                    ) : (
                      (Array.isArray(clients) ? clients : []).map((client) => (
                        <div key={client.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`eng-client-${client.id}`}
                            checked={selectedClientIds.includes(client.id)}
                            onCheckedChange={() => toggleClient(client.id)}
                            disabled={loading}
                          />
                          <Label
                            htmlFor={`eng-client-${client.id}`}
                            className="cursor-pointer font-normal"
                          >
                            {client.name} ({client.code})
                          </Label>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {selectedClientIds.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedClientIds.length}개 고객사 선택됨
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">
                {isEditMode ? '비밀번호 (변경 시에만 입력)' : '비밀번호 *'}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={PASSWORD_RULE_HINT}
                required={!isEditMode}
                disabled={loading}
                aria-describedby="password-rule"
              />
              <p id="password-rule" className="text-xs text-muted-foreground">
                {PASSWORD_RULE_HINT}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                {isEditMode ? '비밀번호 확인' : '비밀번호 확인 *'}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호를 다시 입력하세요"
                required={!isEditMode || !!password}
                disabled={loading}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
                disabled={loading}
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                활성 상태
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
