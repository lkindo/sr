import type { UserListItem } from '@/types/user-view';

/**
 * 유형 판별에 실제로 필요한 필드만 뽑은 입력 타입.
 * 뷰 타입(`UserListItem`)에서 파생시켜, 뷰가 바뀌면 여기도 컴파일러가 따라오게 한다.
 */
type UserTypeSource = Pick<UserListItem, 'id' | 'userType' | 'roles' | 'clients'>;

// 사용자 유형 판별 함수
export const getUserTypeLabel = (user: UserTypeSource): string => {
  // 1. Admin 역할이 있으면 시스템 관리자
  const hasAdminRole = user.roles.some((ur) => ur.role.name === 'ADMIN');
  if (hasAdminRole) {
    return '시스템 운영팀';
  }

  // 2. 엔지니어 타입이면 SR 처리자
  if (user.userType === 'ENGINEER') {
    return '기술 지원팀';
  }

  // 3. 고객사 타입이거나 고객사에 소속되어 있으면 SR 요청자
  if (user.userType === 'CLIENT' || user.clients.length > 0) {
    return '고객사 담당자';
  }

  // 기본값
  return '미분류';
};

// 유형별 배지 색상 결정
export const getUserTypeBadgeVariant = (typeLabel: string) => {
  switch (typeLabel) {
    case '시스템 운영팀':
      return 'destructive' as const;
    case '기술 지원팀':
      return 'default' as const;
    case '고객사 담당자':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
};

/**
 * 승인 화면에서 '이메일 미인증' 을 보일 계정인가(2026-09-18 소유자 결정 D13 B+).
 * 가입 승인을 기다리는 계정(비활성이거나 승인 대기 소속이 있음) 가운데 가입 확인 링크를 열지 않은 계정이다.
 * 관리자가 만든 계정은 확인 메일을 받지 않으므로, 활성이고 대기 소속이 없으면 보이지 않는다.
 * 응답에 인증 필드가 없으면(`undefined`) 판단하지 않는다.
 */
export function showsEmailUnverified(user: {
  emailVerified?: string | Date | null;
  isActive: boolean;
  clients?: ReadonlyArray<{ status?: string }>;
}): boolean {
  if (user.emailVerified !== null) return false;
  const awaitingApproval =
    !user.isActive || (user.clients ?? []).some((link) => link.status === 'PENDING');
  return awaitingApproval;
}

// 비밀번호 제외 헬퍼 함수
export function excludePassword<T extends { password: string }>(user: T): Omit<T, 'password'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}
