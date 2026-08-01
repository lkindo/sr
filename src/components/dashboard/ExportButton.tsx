'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import { formatISODateInAppZone } from '@/lib/timezone';

export function ExportButton() {
  const { hasAnyRole } = usePermissions();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Only Admin, Manager, Engineer can export
  if (!hasAnyRole(['ADMIN', 'MANAGER', 'ENGINEER'])) {
    return null;
  }

  const handleExport = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/reports/export');

      if (!response.ok) {
        // 레이트리밋은 "실패"가 아니라 "잠시 후 다시"라고 안내해야 한다.
        if (response.status === 429) {
          toast({
            title: '요청이 너무 잦습니다',
            description: '내보내기는 잠시 후 다시 시도해 주세요.',
            variant: 'destructive',
          });
          return;
        }
        throw new Error('Export failed');
      }

      // Create blob from response stream
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // 파일명 날짜도 KST 기준으로 — 서버가 붙이는 이름과 어긋나지 않게 한다.
      a.download = `sr_report_${formatISODateInAppZone()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: '다운로드 완료',
        description: '리스포트를 성공적으로 다운로드했습니다.',
      });
    } catch (error) {
      toast({
        title: '내보내기 실패',
        description: '파일을 다운로드하는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="hidden md:flex"
      onClick={handleExport}
      disabled={loading}
    >
      <Download className="mr-2 h-4 w-4" />
      {loading ? '다운로드 중...' : '엑셀 다운로드'}
    </Button>
  );
}
