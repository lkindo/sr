# Bolt's Journal - Critical Learnings

## 2024-05-22 - [Example Entry]
**Learning:** [Example Learning]
**Action:** [Example Action]

## 2024-05-23 - Permission Check Optimization
**Learning:** `PermissionService.checkPermission` was fetching the full user object graph (User -> Roles -> Permissions) for every single permission check. This causes significant overhead on frequently accessed endpoints.
**Action:** Replaced in-memory filtering with a direct database `count` query (`prisma.userRole.count`) that leverages database indexes to verify permissions efficiently without data transfer.
