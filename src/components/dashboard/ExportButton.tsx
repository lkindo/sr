'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

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
        throw new Error('Export failed');
      }

      // Create blob from response stream
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sr_report_${new Date().toISOString().split('T')[0]}.csv`;
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
