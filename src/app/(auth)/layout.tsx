import { ThemeToggle } from '@/components/layout/ThemeToggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <div className="text-sm font-semibold tracking-tight">SR Management</div>
        <nav aria-label="화면 설정">
          <ThemeToggle />
        </nav>
      </header>
      {/*
        <main> 이 없어 페이지 전체가 어떤 랜드마크에도 속하지 않았다
        (axe: landmark-one-main, region). 낭독기 사용자가 본문으로 건너뛸 수단이 없다.
      */}
      <main className="flex w-full flex-1 items-center justify-center px-5 pb-12 pt-6">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  );
}
