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
