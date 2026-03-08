## 2024-03-07 - Date Formatting Performance Bottleneck

**Learning:** Initializing `Intl.DateTimeFormat` on every call inside helper functions like `formatDate` and `formatDateTime` creates a massive performance bottleneck, especially when these functions are called frequently in loops or large list renders (like rendering hundreds of SR items). The performance penalty is roughly 30-40x compared to caching the formatter. Also, repeatedly creating `new Date()` objects and modifying them with `.setHours(0,0,0,0)` to calculate day differences in `getDaysUntilDue` adds noticeable overhead over simple mathematical timestamp difference calculation (`getTime()` divided by `86400000`).

**Action:** Cache `Intl.DateTimeFormat` instances at the module level when creating date utility functions. Always favor mathematical calculations with timestamps (`Date.now()`, `getTime()`) over mutating `Date` objects when calculating intervals or differences.
**Learning:** [Example Learning]
**Action:** [Example Action]

## 2024-05-23 - Permission Check Optimization

**Learning:** `PermissionService.checkPermission` was fetching the full user object graph (User -> Roles -> Permissions) for every single permission check. This causes significant overhead on frequently accessed endpoints.
**Action:** Replaced in-memory filtering with a direct database `count` query (`prisma.userRole.count`) that leverages database indexes to verify permissions efficiently without data transfer.

## 2024-05-19 - [Optimize Dashboard Stats API]

**Learning:** `session.user` object correctly contains pre-populated relations like `clientIds`. In heavily queried endpoints like `/api/dashboard/stats/route.ts`, making an additional Prisma query to fetch `userClients` when `session.user.clientIds` is already available is redundant and adds latency.
**Action:** When working in API routes or Server Actions, always check the `Session` object definitions in `src/types/next-auth.d.ts` to see what data is already available before querying the database for user-related associations.
