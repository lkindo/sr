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

## 2024-03-11 - Date Time Formatting Optimization and DST Bug
**Learning:** Caching `Intl.DateTimeFormat` yields massive performance wins (up to 10-100x) over repeatedly calling `toLocaleDateString()` and `toLocaleString()`, making it an ideal optimization for utilities processing large datasets. However, using raw timestamp division (`/ 86400000`) for difference in days across multiple dates introduces serious edge cases around Daylight Saving Time (DST) timezone shifts—creating off-by-one bugs.
**Action:** Always cache formatters for date processing. Never try to calculate differences in calendar days with raw timestamp math; fall back on `Date` instantiation and manual boundary clearing (e.g., `setHours(0,0,0,0)`) to let the browser correctly handle DST complexities securely.
