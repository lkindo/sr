## 2024-05-23 - IDOR Vulnerability in SR Actions

**Vulnerability:** `getSRAction` and related server actions allowed any authenticated user to retrieve SR details by ID without authorization checks.
**Learning:** Server Actions are public endpoints. Even if they are called "internally" by client components, they can be invoked directly. Simply checking for authentication is not enough; authorization against the specific resource (ID) is mandatory.
**Prevention:** Always verify ownership or permission on the retrieved resource before returning it in a Server Action. Use `ensureCanRead...` policies immediately after fetching the resource.

## 2026-01-28 - Sensitive Data Leak in Service Layer

**Vulnerability:** `UserService.getUserById` returned the user object including the password hash, which was then exposed via `getUserAction` and `getProfileAction` server actions.
**Learning:** Service methods often return full database objects by default. If these methods are directly exposed via Server Actions or API routes, sensitive fields (like password hashes) leak.
**Prevention:** Explicitly exclude sensitive fields (password, secrets) in the Service layer before returning data, or use DTOs/Select to fetch only safe fields.

## 2026-02-18 - Unprotected Helper Server Actions

**Vulnerability:** `getSRHandlersForSelection` was a public server action used for populating dropdowns but lacked any authentication or authorization checks, allowing unauthenticated enumeration of internal user details (names, emails).
**Learning:** Helper actions used for UI components (like dropdowns) are often overlooked during security reviews compared to "CRUD" actions. They are still public endpoints and can leak sensitive metadata or user lists.
**Prevention:** Always apply `authenticateAndAuthorize` or strict permission checks to ALL server actions, including those used only for fetching option lists.

## 2026-03-04 - Unprotected 'Getter' Server Actions

**Vulnerability:** `getClientAction` was exposed as a server action without any authentication or authorization checks, allowing potential IDOR attacks to retrieve sensitive client business data.
**Learning:** Getter methods in server action files are easy to overlook if they aren't actively used or if they mirror service methods 1:1. Every exported function in a `'use server'` file is a public API endpoint.
**Prevention:** consistently apply `getAuthenticatedSession()` and permission/ownership checks (e.g., `clientIds.includes(id)`) at the very beginning of every server action.

## 2026-03-11 - Insufficient Scope on Generic Permissions

**Vulnerability:** `SR:READ` permission was assumed to be sufficient for global read access, leading to an IDOR vulnerability where external users (CLIENT_USER/ADMIN) could view SRs of other clients.
**Learning:** Generic permission flags (like `READ`, `UPDATE`) often imply "can do action" but not "on which resource". For multi-tenant systems, these must be combined with ownership checks (e.g., `clientId` matching) unless the user has an explicit internal/admin role.
**Prevention:** In policy functions, distinguish between internal roles (who may have global access via permission flags) and external users (who must pass strict ownership/tenant checks IN ADDITION to permission flags).

## 2026-03-20 - Hardcoded Secrets in Example/Docker Configs

**Vulnerability:** Production credentials (Gmail password, VAPID private key, NextAuth secrets) were committed to `.env.example` and `.env.docker`.
**Learning:** Example files and Docker configurations are often treated as "non-production" and thus less scrutinized, but they are part of the codebase and can leak sensitive credentials if developers use real values for testing.
**Prevention:** Use placeholders (e.g., `your_secret_here`) in `.env.example`. For local dev/docker, use clearly marked weak secrets or mock services. Never commit real credentials, even if they are tied to external services.

## 2026-03-24 - Unprotected Role Getter Actions

**Vulnerability:** `getRoleAction` and `getAllRolesAction` were exposed as public server actions without any authentication or authorization checks.
**Learning:** Even if server actions are not currently used by the client, they are public endpoints. Developers might assume "getter" actions for internal resources like roles are safe or "internal only", but they can be exploited to enumerate system structure.
**Prevention:** Audit all exported functions in files with `'use server'`. Apply `authenticateAndAuthorize` by default to everything, even read-only operations.

## 2026-03-27 - Missing Authorization on List API Endpoints

**Vulnerability:** `GET /api/srs` relied solely on client-provided query parameters (e.g., `clientId`) for filtering, allowing external users to bypass tenant isolation by omitting the filter or requesting another client's data.
**Learning:** API routes that return lists must not trust client filters for authorization boundaries. Authentication middleware (`withAuthAndRateLimit`) only identifies the user; it does not enforce data access policies.
**Prevention:** Always enforce server-side filters based on the authenticated user's session (e.g., force `clientId: { in: session.user.clientIds }` for external users) regardless of what the client requests.

## 2026-03-28 - Missing Authorization on Nested Resources

**Vulnerability:** API routes for nested resources (like SR Attachments) often assume parent resource access is implicitly checked or handled by authentication middleware. However, `GET` and `POST` handlers in `/api/srs/[id]/attachments` failed to verify if the user had permission to view or modify the specific SR.
**Learning:** Authentication is not authorization. Even if a user is logged in, they must be explicitly checked against the specific resource they are trying to access (IDOR prevention).
**Prevention:** Always fetch the parent resource (e.g., `SR`) and apply explicit policy checks (`ensureCanReadSR`, `ensureCanUpdateSR`) immediately before performing any operations on nested resources.
