import Link from "next/link";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { UserNav } from "./UserNav";

export async function Header() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div className="mr-4 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <span className="font-bold text-xl">SR Management</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm lg:gap-6">
            <Link
              href="/dashboard"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              Dashboard
            </Link>
            <Link
              href="/srs"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              SR 목록
            </Link>
            <Link
              href="/clients"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              고객사
            </Link>
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-2">
          <nav className="flex items-center gap-2">
            {session ? (
              <UserNav user={session.user} />
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">로그인</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">회원가입</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}

