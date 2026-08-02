import { Skeleton } from '@/components/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';

interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

export function TableSkeleton({ columns, rows = 5 }: TableSkeletonProps) {
  return (
    /**
     * 스켈레톤은 순수하게 시각적 자리표시자다.
     *
     * `aria-hidden`: 보조기술에는 헤더가 빈 표가 보인다(axe 의 empty-table-header).
     *   화면 낭독기 사용자에게 내용 없는 표를 읽어 주는 것은 방해일 뿐이다.
     * `data-skeleton`: E2E 가 실제 데이터 표와 구분할 수 있게 표식을 남긴다.
     *   스트리밍 중에는 스켈레톤과 실 표가 잠깐 DOM 에 공존하는데, 그때
     *   `page.locator('table')` 이 둘을 잡아 strict mode violation 으로 즉시 죽었다.
     */
    <Table aria-hidden="true" data-skeleton="true">
      <TableHeader>
        <TableRow>
          {Array.from({ length: columns }).map((_, index) => (
            <TableHead key={index}>
              <Skeleton className="h-4 w-24" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <TableCell key={colIndex}>
                <Skeleton className="h-4 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
