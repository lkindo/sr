'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { LogOut, Settings, User } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { Button } from '@/components/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';

interface UserNavProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

export function UserNav({ user }: UserNavProps) {
  const handleSignOut = async () => {
    // NextAuth 의 redirect:true 는 서버 base URL 로 콜백을 절대화하는데,
    // 리버스 프록시(nginx) 뒤 컨테이너에서는 내부 주소(0.0.0.0:3000)로 잘못 이동한다.
    // 세션만 정리한 뒤, 실제 접속 origin 기준으로 초기 화면(/)으로 직접 이동시킨다.
    await signOut({ redirect: false });
    window.location.href = '/';
  };

  const initials =
    user.name
      ?.split(' ')
      .map((n) => n[0] ?? '')
      .join('')
      .toUpperCase() || (user.email[0] ?? '?').toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 w-10 md:h-8 md:w-8 rounded-full"
          aria-label="사용자 메뉴"
        >
          <Avatar className="h-10 w-10 md:h-8 md:w-8">
            <AvatarImage src={user.image || undefined} alt={user.name || ''} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile" className="cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            <span>프로필</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>설정</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>로그아웃</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
