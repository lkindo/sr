## 2024-05-23 - IDOR Vulnerability in SR Actions
**Vulnerability:** `getSRAction` and related server actions allowed any authenticated user to retrieve SR details by ID without authorization checks.
**Learning:** Server Actions are public endpoints. Even if they are called "internally" by client components, they can be invoked directly. Simply checking for authentication is not enough; authorization against the specific resource (ID) is mandatory.
**Prevention:** Always verify ownership or permission on the retrieved resource before returning it in a Server Action. Use `ensureCanRead...` policies immediately after fetching the resource.

## 2026-01-28 - Sensitive Data Leak in Service Layer
**Vulnerability:** `UserService.getUserById` returned the user object including the password hash, which was then exposed via `getUserAction` and `getProfileAction` server actions.
**Learning:** Service methods often return full database objects by default. If these methods are directly exposed via Server Actions or API routes, sensitive fields (like password hashes) leak.
**Prevention:** Explicitly exclude sensitive fields (password, secrets) in the Service layer before returning data, or use DTOs/Select to fetch only safe fields.

## 2026-02-20 - Inconsistent Password Sanitization in UserService
**Vulnerability:** While `getUserById` was sanitized, other methods like `getAllUsers`, `createUser`, and `updateUser` in `UserService` were still returning full User objects including password hashes.
**Learning:** Fixing a vulnerability in one method doesn't guarantee it's fixed everywhere. Inconsistent application of security patterns leaves gaps.
**Prevention:** Use a shared helper function (like `excludePassword`) across all methods in a service to ensure consistent sanitization. Enforce return types (e.g. `Omit<User, 'password'>`) to catch leaks at compile time.
