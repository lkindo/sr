export interface Role {
  id: string;
  name: string;
  description?: string;
}

export interface UserRole {
  role: Role;
}

export interface Client {
  id: string;
  name: string;
  code: string;
}

export interface UserClient {
  client: Client;
  /** 소속 승인 상태. 셀프 회원가입 소속은 승인 전까지 PENDING 이다. */
  status?: 'PENDING' | 'APPROVED';
}

export interface User {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  userType: 'ENGINEER' | 'CLIENT';
  roles: UserRole[];
  clients: UserClient[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
