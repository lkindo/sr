import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-foreground">
      <div className="flex flex-col items-center gap-2 text-center">
        <FileQuestion className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-2xl font-bold tracking-tight">페이지를 찾을 수 없습니다</h2>
        <p className="text-muted-foreground">
          요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">대시보드로 돌아가기</Link>
      </Button>
    </div>
  );
}
