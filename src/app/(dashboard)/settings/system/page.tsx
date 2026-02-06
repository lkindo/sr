'use client';

import { useEffect, useState } from 'react';
import { Database, Lock, Mail, Settings } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Separator } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { SystemSettings } from '@/types/settings';

export default function SystemSettingsPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 시스템 설정 상태
  const [siteName, setSiteName] = useState('');
  const [siteDescription, setSiteDescription] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  // 시스템 설정 가져오기
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings/system');
        if (!response.ok) {
          throw new Error('Failed to fetch system settings');
        }
        const data = await response.json();

        setSiteName(data.siteName || '');
        setSiteDescription(data.siteDescription || '');
        setAdminEmail(data.adminEmail || '');
      } catch (error) {
        console.error(error);
        toast({
          title: '오류',
          description: '시스템 설정을 불러오는데 실패했습니다.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteName,
          siteDescription,
          adminEmail,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save system settings');
      }

      toast({
        title: '성공',
        description: '시스템 설정이 저장되었습니다.',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '시스템 설정 저장에 실패했습니다.';
      toast({
        title: '오류',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">시스템 설정</h1>
        <p className="text-muted-foreground">시스템 전반의 설정을 관리합니다.</p>
        <Badge variant="destructive" className="mt-2">
          ADMIN 전용
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <CardTitle>일반 설정</CardTitle>
          </div>
          <CardDescription>사이트 기본 정보를 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="site-name">사이트 이름</Label>
            <Input
              id="site-name"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="사이트 이름"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-description">사이트 설명</Label>
            <Input
              id="site-description"
              value={siteDescription}
              onChange={(e) => setSiteDescription(e.target.value)}
              placeholder="사이트 설명"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-email">관리자 이메일</Label>
            <Input
              id="admin-email"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@example.com"
            />
            <p className="text-xs text-muted-foreground">
              시스템 알림을 받을 관리자 이메일 주소입니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>데이터베이스</CardTitle>
          </div>
          <CardDescription>데이터베이스 상태 및 관리</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">데이터베이스 백업</p>
              <p className="text-sm text-muted-foreground">마지막 백업: 2025-01-12 10:30</p>
            </div>
            <Button variant="outline">지금 백업</Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">캐시 초기화</p>
              <p className="text-sm text-muted-foreground">시스템 캐시를 초기화합니다.</p>
            </div>
            <Button variant="outline">캐시 삭제</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>이메일 설정</CardTitle>
          </div>
          <CardDescription>SMTP 서버 설정</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="smtp-host">SMTP 호스트</Label>
            <Input id="smtp-host" placeholder="smtp.example.com" disabled />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp-port">포트</Label>
              <Input id="smtp-port" placeholder="587" disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp-security">보안</Label>
              <Input id="smtp-security" value="TLS" disabled />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">이메일 설정은 환경 변수에서 관리됩니다.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <CardTitle>보안 설정</CardTitle>
          </div>
          <CardDescription>인증 및 보안 관련 설정</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">세션 타임아웃</p>
              <p className="text-sm text-muted-foreground">현재: 24시간</p>
            </div>
            <Button variant="outline" disabled>
              변경
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">비밀번호 정책</p>
              <p className="text-sm text-muted-foreground">최소 6자, 영문/숫자 조합</p>
            </div>
            <Button variant="outline" disabled>
              변경
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '설정 저장'}
        </Button>
      </div>
    </div>
  );
}
