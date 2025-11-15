export function Footer() {
  return (
    <footer className="border-t border-border py-6 md:py-0 ml-0 md:ml-64">
      <div className="w-full flex flex-col items-center justify-center gap-4 md:h-16 md:flex-row">
        <p className="text-center text-sm leading-loose text-muted-foreground">
          © 2025 SR Management System. All rights reserved.
        </p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>v0.1.0</span>
        </div>
      </div>
    </footer>
  );
}
