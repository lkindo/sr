import 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    roles?: string[];
    permissions?: string[];
    clientIds?: string[];
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      roles: string[];
      permissions: string[];
      clientIds: string[];
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    roles: string[];
    permissions: string[];
    clientIds: string[];
  }
}
