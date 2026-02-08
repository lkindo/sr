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
