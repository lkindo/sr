import { TableSkeleton } from "@/components/loading/TableSkeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--sr-primary-dark))]">SR 관리</h2>
          <p className="text-sm text-muted-foreground mt-1">
            서비스 요청(SR)을 관리합니다.
          </p>
        </div>
      </div>
      <TableSkeleton columns={11} />
    </div>
  );
}
