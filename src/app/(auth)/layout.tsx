export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="w-full max-w-lg px-6">{children}</div>
    </div>
  );
}
