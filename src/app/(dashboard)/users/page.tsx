import { Suspense } from 'react';

import UsersClient from './UsersClient';

export default function UsersPage() {
  return (
    <Suspense
      fallback={
        <div className="h-96 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      }
    >
      <UsersClient />
    </Suspense>
  );
}
