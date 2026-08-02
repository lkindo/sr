export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 py-8">
      {/*
        <main> 이 없어 페이지 전체가 어떤 랜드마크에도 속하지 않았다
        (axe: landmark-one-main, region). 낭독기 사용자가 본문으로 건너뛸 수단이 없다.
      */}
      <main className="w-full max-w-lg px-6">{children}</main>
    </div>
  );
}
