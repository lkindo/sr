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

## 2024-05-25 - Date Formatting Optimization

**Learning:** `Date.toLocaleDateString()` and `Date.toLocaleString()` recreate the underlying `Intl.DateTimeFormat` instance on every single call. For lists containing hundreds of items, this repeated initialization becomes a significant CPU bottleneck.
**Action:** When formatting dates frequently (especially in utility functions like `src/lib/date-utils.ts`), cache the `Intl.DateTimeFormat` instance at the module level and use `formatter.format(date)` instead of calling the string methods on the `Date` object directly.
