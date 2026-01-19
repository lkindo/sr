'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  FolderTree,
  Pencil,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';

import { ClientDialog } from '@/components/clients/ClientDialog';
import { DeleteClientDialog } from '@/components/clients/DeleteClientDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserDialog } from '@/components/users/UserDialog';
import { useToast } from '@/hooks/use-toast';

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

interface Client {
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

const statusLabels: Record<string, string> = {
  REQUESTED: '요청됨',
  INTAKE: '접수',
  IN_PROGRESS: '진행중',
  ON_HOLD: '대기',
  COMPLETED: '완료',
  CONFIRMED: '확인완료',
  REJECTED: '거부',
};

const priorityLabels: Record<string, string> = {
  CRITICAL: '긴급',
  HIGH: '높음',
  MEDIUM: '보통',
  LOW: '낮음',
};

const statusColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
  REQUESTED: 'secondary',
  INTAKE: 'default',
  IN_PROGRESS: 'default',
  ON_HOLD: 'secondary',
  COMPLETED: 'default',
  CONFIRMED: 'default',
  REJECTED: 'destructive',
};

const priorityColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'default',
  LOW: 'secondary',
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchClient = async () => {
    try {
      const response = await fetch(`/api/clients/${params.id}`);
      if (!response.ok) {
        if (response.status === 404) {
          toast({
            title: '오류',
            description: '고객사를 찾을 수 없습니다.',
            variant: 'destructive',
          });
          router.push('/clients');
          return;
        }
        throw new Error('Failed to fetch client');
      }
      const data = await response.json();
      setClient(data);
    } catch {
      toast({
        title: '오류',
        description: '고객사 정보를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) {
      fetchClient();
    }
  }, [params.id, toast, router]);

  const handleClientUpdated = () => {
    fetchClient();
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
    fetchClient();
    setIsUserDialogOpen(false);
  };

  const handleRemoveUser = async (userId: string) => {
    if (!confirm('정말 이 사용자를 고객사에서 제외하시겠습니까?')) return;

    try {
      // 1. Get current user details to find other clients
      const userRes = await fetch(`/api/users/${userId}`);
      if (!userRes.ok) throw new Error('Failed to fetch user details');
      const userData = await userRes.json();

      // 2. Filter out this client
      const currentClientIds = userData.clients?.map((uc: any) => uc.client.id) || [];
      const newClientIds = currentClientIds.filter((id: string) => id !== client?.id);

      // 3. Update user
      const updateRes = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientIds: newClientIds }),
      });

      if (!updateRes.ok) throw new Error('Failed to unlink user');

      toast({
        title: '성공',
        description: '사용자가 고객사에서 제외되었습니다.',
      });
      fetchClient();
    } catch {
      toast({
        title: '오류',
        description: '사용자 제외에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
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
        <div className="flex gap-2">
          <Button onClick={() => setIsEditDialogOpen(true)} className="sr-btn-template">
            <Pencil className="mr-2 h-4 w-4" />
            수정
          </Button>
          <Button
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={client.users.length > 0 || client.srs.length > 0}
            variant="destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            삭제
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 sr-card-template bg-white">
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

        <div className="sr-card-template bg-white">
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
          <div className="sr-card-template bg-white">
            {/* 카드 헤더 */}
            <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
              <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">
                서비스 카테고리
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                이 고객사에 등록된 서비스 카테고리 목록입니다.
              </p>
            </div>

            {/* 카드 내용 */}
            <div className="px-6 py-5">
              {client.serviceCategories.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  등록된 서비스 카테고리가 없습니다.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>카테고리명</TableHead>
                      <TableHead>설명</TableHead>
                      <TableHead>SLA (시간)</TableHead>
                      <TableHead>우선순위</TableHead>
                      <TableHead>담당자</TableHead>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <div className="sr-card-template bg-white">
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
          <div className="sr-card-template bg-white">
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
                          <Badge variant={statusColors[sr.status]}>{statusLabels[sr.status]}</Badge>
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
    </div>
  );
}
