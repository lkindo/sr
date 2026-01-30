interface UserRole {
  role: {
    id: string;
    name: string;
  };
}

interface UserClient {
  client: {
    id: string;
    name: string;
    code: string;
  };
}

interface User {
  id: string;
  userType: 'ENGINEER' | 'CLIENT';
  roles: UserRole[];
  clients: UserClient[];
}

// 사용자 유형 판별 함수
export const getUserTypeLabel = (user: User): string => {
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
 * 사용자 객체에서 비밀번호 필드를 제외합니다.
 * @param user 비밀번호가 포함된 사용자 객체
 * @returns 비밀번호가 제외된 사용자 객체
 */
export function excludePassword<T extends { password: string }>(user: T): Omit<T, 'password'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}
