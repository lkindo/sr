# Bolt's Journal - Critical Learnings

## 2024-05-22 - [Example Entry]

**Learning:** [Example Learning]
**Action:** [Example Action]

## 2024-05-23 - Permission Check Optimization

**Learning:** `PermissionService.checkPermission` was fetching the full user object graph (User -> Roles -> Permissions) for every single permission check. This causes significant overhead on frequently accessed endpoints.
**Action:** Replaced in-memory filtering with a direct database `count` query (`prisma.userRole.count`) that leverages database indexes to verify permissions efficiently without data transfer.

## 2025-02-18 - Dashboard Stats Aggregation

**Learning:** The dashboard stats API used a complex `prisma.$queryRaw` query alongside `prisma.groupBy` queries, resulting in redundant data scanning and complex logic. The `prisma.$queryRaw` was calculating aggregates (e.g., total, pending) that could be easily derived from the `groupBy` results in memory, or with targeted index-only `count` queries.
**Action:** Removed the redundant raw SQL query and replaced it with in-memory derivation from `groupBy` results + conditional lightweight `count` queries for specific user scopes. This simplified the code and reduced the number of heavy DB operations.
