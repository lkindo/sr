/**
 * 사용자 관리 화면(클라이언트 컴포넌트)이 HTTP 응답으로 받는 뷰 타입.
 *
 * Prisma 모델(`User`/`Role`/`Client`/`UserRole`/`UserClient`)과 이름이 겹치면
 * import 한 줄 차이로 서버 모델과 화면 뷰가 뒤바뀌므로 전부 `*View` 접미사를 붙인다.
 * 이 화면은 `'use client'` + HTTP fetch 라 서버 서비스의 반환 타입을 그대로 쓸 수 없고,
 * `userType` 은 Prisma 컬럼이 아니라 `user.service.ts` 가 계산해 내려주는 값이다.
 */

import type { ClientSummary } from './client.types';

interface RoleView {
  id: string;
  name: string;
  description?: string;
}

interface UserRoleView {
  role: RoleView;
}

interface UserClientView {
  client: ClientSummary;
  /** 소속 승인 상태. 셀프 회원가입 소속은 승인 전까지 PENDING 이다. */
  status?: 'PENDING' | 'APPROVED';
}

export interface UserListItem {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  userType: 'ENGINEER' | 'CLIENT';
  roles: UserRoleView[];
  clients: UserClientView[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
