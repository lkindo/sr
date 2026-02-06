export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-200px)] w-full">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-4 border-[hsl(var(--sr-primary-dark)/0.1)]"></div>
          <div className="absolute inset-0 rounded-full border-4 border-[hsl(var(--sr-accent-orange))] border-t-transparent animate-spin"></div>
        </div>
        <div className="space-y-2 text-center">
          <p className="text-lg font-medium text-[hsl(var(--sr-primary-dark))] animate-pulse">
            데이터를 불러오는 중입니다
          </p>
          <p className="text-sm text-muted-foreground">잠시만 기다려주세요...</p>
        </div>
      </div>
    </div>
  );
}
