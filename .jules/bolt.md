# Bolt's Journal - Critical Learnings

## 2024-05-22 - [Example Entry]

**Learning:** [Example Learning]
**Action:** [Example Action]

## 2024-05-23 - Permission Check Optimization

**Learning:** `PermissionService.checkPermission` was fetching the full user object graph (User -> Roles -> Permissions) for every single permission check. This causes significant overhead on frequently accessed endpoints.
**Action:** Replaced in-memory filtering with a direct database `count` query (`prisma.userRole.count`) that leverages database indexes to verify permissions efficiently without data transfer.

## 2024-05-19 - [Optimize Dashboard Stats API]
**Learning:** `session.user` object correctly contains pre-populated relations like `clientIds`. In heavily queried endpoints like `/api/dashboard/stats/route.ts`, making an additional Prisma query to fetch `userClients` when `session.user.clientIds` is already available is redundant and adds latency.
**Action:** When working in API routes or Server Actions, always check the `Session` object definitions in `src/types/next-auth.d.ts` to see what data is already available before querying the database for user-related associations.

## 2024-05-24 - [Intl.DateTimeFormat Cache]
**Learning:** Calling `new Date(date).toLocaleDateString()` implicitly initializes a new `Intl.DateTimeFormat` instance on every call, which is very slow. This causes significant lag when formatting dates inside high-frequency components or loops.
**Action:** Extract `Intl.DateTimeFormat` configurations to the module level and reuse them via `formatter.format(new Date(date))`. This provides a massive speedup (~10x) for date string processing without external libraries.
