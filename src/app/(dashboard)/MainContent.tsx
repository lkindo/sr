'use client';

import { usePathname } from 'next/navigation';

import { Sidebar } from '@/components/layout/Sidebar';

export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard';

  return (
    <div className="flex-1 flex">
      <Sidebar />
      <main
        // 레이아웃의 "본문으로 건너뛰기" 링크가 이 id 를 가리킨다.
        // tabIndex={-1} 이 있어야 앵커 이동 후 포커스가 실제로 여기에 앉는다 —
        // 없으면 스크롤만 되고 다음 탭이 다시 사이드바로 돌아간다.
        id="main-content"
        tabIndex={-1}
        className={
          isDashboard
            ? 'flex-1 px-3 py-4 md:p-8 sr-content-bg focus-visible:outline-none'
            : 'flex-1 md:ml-64 px-3 py-4 md:p-8 sr-content-bg focus-visible:outline-none'
        }
      >
        <div className="w-full mx-auto">{children}</div>
      </main>
    </div>
  );
}
