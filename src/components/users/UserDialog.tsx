'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Client {
  id: string;
  name: string;
  code: string;
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
    client: Client;
  }>;
}

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSaved: () => void;
  defaultClientId?: string;
  clients?: Client[];
  roles?: any[];
}

export function UserDialog({
  open,
  onOpenChange,
  user,
  onSaved,
  defaultClientId,
  clients: propClients,
  roles,
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

  // Use passed clients or empty array initially
  const [clients, setClients] = useState<Client[]>(propClients || []);
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(!propClients);
  const { toast } = useToast();

  const isEditMode = !!user;

  // Update clients if prop changes
  useEffect(() => {
    if (propClients) {
      setClients(propClients);
      setLoadingClients(false);
    }
  }, [propClients]);

  const fetchClients = useCallback(async () => {
    if (propClients) return; // Skip if provided via props

    try {
      const response = await fetch('/api/clients?pageSize=100'); // 충분한 수의 고객사를 가져오기 위해 pageSize 증가
      if (!response.ok) throw new Error('Failed to fetch clients');
      const result = await response.json();

      // 페이지네이션 된 응답({ data: [], meta: {} })과 일반 배열 응답([]) 모두 처리
      const clientData = Array.isArray(result)
        ? result
        : Array.isArray(result.data)
          ? result.data
          : [];

      if (Array.isArray(clientData)) {
        setClients(clientData);
      } else {
        console.error('Unexpected API response format:', result);
        setClients([]);
        toast({
          title: '데이터 오류',
          description: '고객사 목록 형식이 올바르지 않습니다.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      setClients([]);
      toast({
        title: '오류',
        description: '고객사 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoadingClients(false);
    }
  }, [toast, propClients]);

  useEffect(() => {
    if (open && !propClients) {
      fetchClients();
    }
  }, [open, fetchClients, propClients]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (name.length < 2) {
      toast({
        title: '오류',
        description: '이름은 최소 2자 이상이어야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!isEditMode && password.length < 8) {
      toast({
        title: '오류',
        description: '비밀번호는 최소 8자 이상이어야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    if (isEditMode && password && password.length < 8) {
      toast({
        title: '오류',
        description: '비밀번호는 최소 8자 이상이어야 합니다.',
        variant: 'destructive',
      });
      return;
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

    setLoading(true);

    try {
      const payload: {
        name?: string;
        email?: string;
        password?: string;
        isActive?: boolean;
        userType?: string;
        roleIds?: string[];
        clientIds?: string[];
      } = {
        name,
        email,
        isActive,
        userType,
        clientIds:
          userType === 'CLIENT' ? (selectedClientId ? [selectedClientId] : []) : selectedClientIds,
      };

      if (password) {
        payload.password = password;
      }

      const url = isEditMode ? `/api/users/${user.id}` : '/api/users';
      const method = isEditMode ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save user');
      }

      toast({
        title: '성공',
        description: `사용자가 ${isEditMode ? '수정' : '생성'}되었습니다.`,
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '사용자 저장에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
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
                placeholder="최소 8자 이상"
                required={!isEditMode}
                disabled={loading}
              />
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
