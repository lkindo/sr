import React from 'react';

import { Table } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * 데스크톱 전용 테이블 껍데기.
 *
 * `ClientTable:31`, `RoleTable:26`, `UserTable:42`, `SRsDataTable:598` 네 곳에
 * 아래 두 줄이 글자까지 동일하게 복제돼 있었다:
 *
 *   <div className="hidden md:block overflow-x-auto">
 *     <Table className="sr-table-template">
 *
 * 기본 클래스에 `rounded-md border` 같은 것을 얹지 말 것 — 원본에 없던 값이고,
 * 네 화면의 테이블 테두리가 한꺼번에 바뀐다.
 */
export function ResponsiveTableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <Table className="sr-table-template">{children}</Table>
    </div>
  );
}

/**
 * 모바일 목록의 카드 컨테이너.
 *
 * `ClientMobileList:53`, `RoleMobileList:32`, `UserMobileList:60` 세 곳의 공통 클래스다.
 * `UserMobileList` 만 선택 상태에 따라 `ring-2 ring-primary border-primary` 를 덧붙이므로
 * `className` 은 **덮어쓰기가 아니라 병합**한다.
 *
 * 안쪽 패딩(`p-3.5 space-y-2`)은 각 카드가 자체 래퍼로 갖고 있으므로 여기 넣지 않는다.
 * `SRsDataTable:740` 은 바깥 컨테이너 패딩이 달라(`p-3`) 이 통합 대상이 아니다.
 */
export function MobileListCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border rounded-lg bg-card text-card-foreground shadow-sm overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}
