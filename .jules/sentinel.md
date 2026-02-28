## 2024-05-24 - Missing Authorization Checks in API Routes
**Vulnerability:** Several API routes under `src/app/api/roles/` were only verifying authentication (`withAuthAndRateLimit`) but lacked authorization checks, allowing any authenticated user to list, create, update, and delete roles.
**Learning:** The `withAuthAndRateLimit` wrapper only guarantees an authenticated session but does not enforce specific permissions. Route handlers must explicitly call policy functions (e.g., `ensureCanReadRole`, `ensureCanCreateRole`) from `@/lib/policies` to verify authorization.
**Prevention:** Always ensure that route handlers mapped to sensitive resources explicitly call the appropriate policy enforcement functions after extracting the session and before performing the action.
