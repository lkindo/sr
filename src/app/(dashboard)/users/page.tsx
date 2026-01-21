'use client';

import dynamic from 'next/dynamic';

const UsersClient = dynamic(() => import('./UsersClient'), {
  ssr: false,
  loading: () => (
    <div className="h-96 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  ),
});

export default function UsersPage() {
  return <UsersClient />;
}
