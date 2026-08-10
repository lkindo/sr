'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileText,
  FolderTree,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';

import { ClientDialog } from '@/components/clients/ClientDialog';
import { DeleteClientDialog } from '@/components/clients/DeleteClientDialog';
import { ServiceCategoryDialog } from '@/components/clients/ServiceCategoryDialog';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Separator } from '@/components/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { UserDialog } from '@/components/users/UserDialog';
import { useToast } from '@/hooks/use-toast';
import { apiDelete, ApiError, apiGet, apiPatch, retryUnlessClientError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

interface ServiceCategory {
  id: string;
  categoryName: string;
  description?: string;
  slaHours: number;
  priority: string;
  handler?: {
    id: string;
    name: string;
    email: string;
  };
  backupHandler?: {
    id: string;
    name: string;
    email: string;
  };
}

interface UserClient {
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface SR {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

/** 고객사 상세 화면 전용 응답 형태. 선택 목록용 `ClientSummary` 와 달리 연관 목록까지 포함한다. */
interface ClientDetail {
  id: string;
  code: string;
  name: string;
  industry?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  isActive: boolean;
  serviceCategories: ServiceCategory[];
  users: UserClient[];
  srs: SR[];
}

/**
 * `/api/users/[id]` 응답 중 "사용자 제외" 가 쓰는 부분만.
 *
 * 이 화면은 사용자의 소속 고객사 id 목록만 필요하다 — 전체 응답을 다시 적으면 서버가
 * 필드를 늘릴 때마다 여기가 거짓말을 하게 된다.
 */
interface UserClients {
  clients?: Array<{ client: { id: string } }>;
}

import {
  priorityBadgeVariants as priorityColors,
  priorityLabels,
  statusBadgeVariants as statusColors,
  statusLabelOf,
} from '@/lib/constants/sr';

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  // `[id]` 는 캐치올 세그먼트가 아니라 항상 문자열이지만 useParams 의 타입은 배열도 허용한다.
  // queryKey 와 URL 이 같은 값에서 나와야 하므로 여기서 한 번만 좁힌다.
  const clientId = typeof params.id === 'string' ? params.id : '';
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  // null = 생성 모드
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const { toast } = useToast();

  /**
   * 고객사 상세.
   *
   * ⚠️ `/api/clients/[id]` 는 목록 봉투(`{data, meta}`)를 쓰지 않고 bare object 를 준다
   * (예외 라우트 — src/lib/pagination.ts 상단에 문서화돼 있다). 그래서 apiList 가 아니라
   * apiGet 이다.
   *
   * 예전에는 fetchClient 를 useCallback 으로 감싸 신원을 고정하고 effect 의 deps 에 넣었다.
   * 그 역할은 queryKey 가 대신한다 — id 가 바뀌면 다른 쿼리가 되고, 같으면 다시 돌지 않는다.
   *
   * `staleTime: 0` 은 "화면에 들어올 때마다 다시 조회한다" 는 기존 동작을 지키기 위한 것이다.
   * 전역 기본값 60초를 그대로 두면 목록에서 되돌아왔을 때 방금 지운 카테고리가 남아 보인다.
   *
   * `enabled` 는 예전 effect 의 `if (params.id)` 가드를 그대로 옮긴 것이다. id 가 없으면
   * 쿼리가 아예 돌지 않고 isPending 에 머문다 — 예전에도 loading 이 true 로 남았다.
   */
  const {
    data: client,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.clients.detail(clientId),
    queryFn: () => apiGet<ClientDetail>(`/api/clients/${clientId}`),
    enabled: !!clientId,
    staleTime: 0,
    retry: retryUnlessClientError,
  });

  // 조회 실패는 토스트로 알린다. v5 의 useQuery 에는 onError 가 없어 effect 로 옮긴다.
  // `error` 는 실패마다 새 객체이므로 실패 1회당 정확히 한 번 실행된다 — 기존 catch 와 같다.
  //
  // 404 만 다르게 다룬다: 없는 고객사를 붙잡고 있어 봐야 할 일이 없으므로 목록으로 돌려보낸다.
  // 예전에는 이 분기를 `response.status === 404` 로 했고, 지금은 ApiError 가 status 를 싣고
  // 온다 — 그러라고 만든 타입이다.
  useEffect(() => {
    if (!error) return;
    if (error instanceof ApiError && error.status === 404) {
      toast({
        title: '오류',
        description: '고객사를 찾을 수 없습니다.',
        variant: 'destructive',
      });
      router.push('/clients');
      return;
    }
    toast({
      title: '오류',
      description: '고객사 정보를 불러오는데 실패했습니다.',
      variant: 'destructive',
    });
  }, [error, toast, router]);

  const handleClientUpdated = () => {
    // 예전에는 fetchClient() 를 다시 불렀다. refetch 가 같은 일을 한다.
    void refetch();
    setIsEditDialogOpen(false);
  };

  const handleClientDeleted = () => {
    toast({
      title: '성공',
      description: '고객사가 삭제되었습니다.',
    });
    router.push('/clients');
  };

  const handleUserSaved = () => {
    void refetch();
    setIsUserDialogOpen(false);
  };

  const openCreateCategory = () => {
    setEditingCategory(null);
    setIsCategoryDialogOpen(true);
  };

  const openEditCategory = (category: ServiceCategory) => {
    setEditingCategory(category);
    setIsCategoryDialogOpen(true);
  };

  const handleCategorySaved = () => {
    void refetch();
    setIsCategoryDialogOpen(false);
    setEditingCategory(null);
  };

  /**
   * 서비스 카테고리 삭제.
   *
   * SR 이 연결된 카테고리는 서버가 막는다(참조 무결성). 그 이유를 **그대로** 보여준다 —
   * "삭제 실패"로 뭉뚱그리면 사용자는 비활성화하라는 안내를 볼 수 없다. 이건 계약이므로
   * 고정 문구로 바꾸지 말 것.
   *
   * 예전에는 `body.error || '카테고리 삭제에 실패했습니다.'` 를 손으로 언랩했다. 지금은
   * api-client 가 서버의 `error` 필드를 ApiError.message 로 옮겨 주고, 서버가 아무 메시지도
   * 주지 않았을 때만 아래 fallbackMessage 가 쓰인다 — 우변이 그대로 이사한 것이다.
   */
  const deleteCategory = useMutation({
    mutationFn: (category: ServiceCategory) =>
      apiDelete(`/api/clients/${clientId}/categories/${category.id}`, {
        fallbackMessage: '카테고리 삭제에 실패했습니다.',
      }),
    onSuccess: () => {
      toast({ title: '성공', description: '서비스 카테고리가 삭제되었습니다.' });
      void refetch();
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '카테고리 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const handleDeleteCategory = (category: ServiceCategory) => {
    // confirm 은 서버를 거치지 않는 검사라 mutation 밖에 남긴다 — 취소했을 때
    // pending 상태를 스치지 않아야 한다.
    if (!confirm(`'${category.categoryName}' 카테고리를 삭제하시겠습니까?`)) return;
    deleteCategory.mutate(category);
  };

  /**
   * 사용자를 이 고객사에서 제외.
   *
   * ⚠️ **읽기-수정-쓰기다.** 서버에 "이 한 건만 해제" 라우트가 없어서, 사용자의 소속 목록
   * 전체를 GET 으로 읽고 이 고객사만 빼서 PATCH 로 되쓴다.
   *
   * 두 호출을 하나의 mutationFn 안에 순차로 두지만 **원자성은 없다.** GET 과 PATCH 사이에
   * 다른 화면이 같은 사용자의 소속을 바꾸면 그 변경을 조용히 덮어쓴다. 이 경합은 fetch 를
   * 쓰던 시절과 **동일**하며(여기서 새로 생긴 것이 아니다), 없애려면 서버 라우트가 필요하다.
   */
  const removeUser = useMutation({
    mutationFn: async (userId: string) => {
      // 1. Get current user details to find other clients
      const userData = await apiGet<UserClients>(`/api/users/${userId}`, {
        fallbackMessage: 'Failed to fetch user details',
      });

      // 2. Filter out this client
      const currentClientIds = userData.clients?.map((uc) => uc.client.id) || [];
      const newClientIds = currentClientIds.filter((id) => id !== client?.id);

      // 3. Update user
      await apiPatch(
        `/api/users/${userId}`,
        { clientIds: newClientIds },
        { fallbackMessage: 'Failed to unlink user' }
      );
    },
    onSuccess: () => {
      toast({
        title: '성공',
        description: '사용자가 고객사에서 제외되었습니다.',
      });
      void refetch();
    },
    onError: () => {
      // 어느 단계에서 왜 실패했는지 구분하지 않고 항상 같은 문장을 보여 준다. 서버 메시지를
      // 삼키는 것은 기존 catch 의 계약이다(위 카테고리 삭제와 반대인 점에 주의).
      toast({
        title: '오류',
        description: '사용자 제외에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const handleRemoveUser = (userId: string) => {
    if (!confirm('정말 이 사용자를 고객사에서 제외하시겠습니까?')) return;
    removeUser.mutate(userId);
  };

  // 예전 `loading` state 는 최초 조회에서만 켜졌다 — 재조회(fetchClient 재호출)는 그것을
  // 다시 true 로 만들지 않았다. 그래서 isFetching 이 아니라 isPending 이다.
  if (isPending) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">고객사를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/clients">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--sr-primary-dark))]">
              {client.name}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">고객사 코드: {client.code}</p>
          </div>
        </div>
        {/*
          이 페이지에는 서비스 분류마다 '<분류명> 수정' / '<분류명> 삭제' 버튼이 따로 있다.
          그래서 접근성 이름이 그냥 '수정'/'삭제'이면 스크린리더 사용자에게도, 셀렉터에도
          어느 것을 가리키는지 모호하다. 실제로 E2E 의 getByRole('button', {name:/수정/})
          이 8개에 걸려 실패했다. 고객사 자체를 대상으로 한다는 것을 이름에 명시한다.
        */}
        <div className="flex gap-2">
          <Button
            onClick={() => setIsEditDialogOpen(true)}
            className="sr-btn-template"
            aria-label="고객사 정보 수정"
          >
            <Pencil className="mr-2 h-4 w-4" />
            수정
          </Button>
          <Button
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={client.users.length > 0 || client.srs.length > 0}
            variant="destructive"
            aria-label="고객사 삭제"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            삭제
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 sr-card-template">
          {/* 카드 헤더 */}
          <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">기본 정보</h3>
          </div>

          {/* 카드 내용 */}
          <div className="px-6 py-5 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">고객사 코드</h3>
                <p className="text-sm">{client.code}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">고객사명</h3>
                <p className="text-sm">{client.name}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">산업</h3>
                <p className="text-sm">{client.industry || '-'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">상태</h3>
                <Badge variant={client.isActive ? 'default' : 'secondary'}>
                  {client.isActive ? '활성' : '비활성'}
                </Badge>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">연락처 정보</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">담당자</p>
                  <p className="text-sm">{client.contactPerson || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">이메일</p>
                  <p className="text-sm">{client.contactEmail || '-'}</p>
                </div>
              </div>
              {client.contactPhone && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">전화번호</p>
                  <p className="text-sm">{client.contactPhone}</p>
                </div>
              )}
            </div>

            {client.address && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">주소</h3>
                  <p className="text-sm">{client.address}</p>
                </div>
              </>
            )}

            {(client.contractStartDate || client.contractEndDate) && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">계약 정보</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {client.contractStartDate && (
                      <div>
                        <p className="text-xs text-muted-foreground">계약 시작일</p>
                        <p className="text-sm">
                          {new Date(client.contractStartDate).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                    )}
                    {client.contractEndDate && (
                      <div>
                        <p className="text-xs text-muted-foreground">계약 종료일</p>
                        <p className="text-sm">
                          {new Date(client.contractEndDate).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="sr-card-template">
          {/* 카드 헤더 */}
          <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">통계</h3>
          </div>

          {/* 카드 내용 */}
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">사용자</span>
              </div>
              <span className="text-2xl font-bold">{client.users.length}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">SR</span>
              </div>
              <span className="text-2xl font-bold">{client.srs.length}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">서비스 카테고리</span>
              </div>
              <span className="text-2xl font-bold">{client.serviceCategories.length}</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="categories" className="w-full">
        <TabsList>
          <TabsTrigger value="categories">
            서비스 카테고리 ({client.serviceCategories.length})
          </TabsTrigger>
          <TabsTrigger value="users">사용자 ({client.users.length})</TabsTrigger>
          <TabsTrigger value="srs">최근 SR ({client.srs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="mt-6">
          <div className="sr-card-template">
            {/* 카드 헤더 */}
            <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))] flex justify-between items-center">
              <div>
                <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">
                  서비스 카테고리
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  이 고객사에 등록된 서비스 카테고리 목록입니다.
                </p>
              </div>
              <Button size="sm" onClick={openCreateCategory}>
                <Plus className="mr-2 h-4 w-4" />
                카테고리 추가
              </Button>
            </div>

            {/* 카드 내용 */}
            <div className="px-6 py-5">
              {client.serviceCategories.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-muted-foreground">등록된 서비스 카테고리가 없습니다.</p>
                  {/* 카테고리가 0개면 이 고객사는 SR 을 한 건도 받을 수 없다 — 막다른 길이
                      되지 않도록 여기서 바로 만들 수 있게 한다(감사 3.18). */}
                  <p className="text-sm text-muted-foreground">
                    카테고리가 없으면 이 고객사는 SR을 접수할 수 없습니다.
                  </p>
                  <Button size="sm" onClick={openCreateCategory}>
                    <Plus className="mr-2 h-4 w-4" />첫 카테고리 추가
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>카테고리명</TableHead>
                      <TableHead>설명</TableHead>
                      <TableHead>SLA (시간)</TableHead>
                      <TableHead>우선순위</TableHead>
                      <TableHead>담당자</TableHead>
                      <TableHead className="text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.serviceCategories.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium">{category.categoryName}</TableCell>
                        <TableCell>{category.description || '-'}</TableCell>
                        <TableCell>{category.slaHours}시간</TableCell>
                        <TableCell>
                          <Badge variant={priorityColors[category.priority]}>
                            {priorityLabels[category.priority]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {category.handler ? (
                            <div>
                              <p className="text-sm">{category.handler.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {category.handler.email}
                              </p>
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditCategory(category)}
                              aria-label={`${category.categoryName} 수정`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteCategory(category)}
                              aria-label={`${category.categoryName} 삭제`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <div className="sr-card-template">
            {/* 카드 헤더 */}
            <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))] flex justify-between items-center">
              <div>
                <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">사용자</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  이 고객사에 속한 사용자 목록입니다.
                </p>
              </div>
              <Button
                onClick={() => setIsUserDialogOpen(true)}
                size="sm"
                className="sr-btn-template-primary"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                사용자 추가
              </Button>
            </div>

            {/* 카드 내용 */}
            <div className="px-6 py-5">
              {client.users.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">등록된 사용자가 없습니다.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>이름</TableHead>
                      <TableHead>이메일</TableHead>
                      <TableHead className="text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.users.map((userClient) => (
                      <TableRow key={userClient.user.id}>
                        <TableCell className="font-medium">{userClient.user.name}</TableCell>
                        <TableCell>{userClient.user.email}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveUser(userClient.user.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="srs" className="mt-6">
          <div className="sr-card-template">
            {/* 카드 헤더 */}
            <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
              <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">최근 SR</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                이 고객사의 최근 SR 목록입니다 (최대 10개).
              </p>
            </div>

            {/* 카드 내용 */}
            <div className="px-6 py-5">
              {client.srs.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">등록된 SR이 없습니다.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>제목</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>우선순위</TableHead>
                      <TableHead>생성일</TableHead>
                      <TableHead className="text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.srs.map((sr) => (
                      <TableRow key={sr.id}>
                        <TableCell className="font-medium">{sr.title}</TableCell>
                        <TableCell>
                          <Badge variant={statusColors[sr.status]}>
                            {statusLabelOf(sr.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={priorityColors[sr.priority]}>
                            {priorityLabels[sr.priority]}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(sr.createdAt).toLocaleDateString('ko-KR')}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/srs/${sr.id}`}>상세보기</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <ClientDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        client={client}
        onSaved={handleClientUpdated}
      />

      <DeleteClientDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        client={client}
        onDeleted={handleClientDeleted}
      />

      <UserDialog
        open={isUserDialogOpen}
        onOpenChange={setIsUserDialogOpen}
        user={null}
        onSaved={handleUserSaved}
        defaultClientId={client?.id}
      />

      <ServiceCategoryDialog
        open={isCategoryDialogOpen}
        onOpenChange={setIsCategoryDialogOpen}
        clientId={client.id}
        category={editingCategory}
        onSaved={handleCategorySaved}
      />
    </div>
  );
}
