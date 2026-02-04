## 2024-05-22 - [Prisma Over-fetching Optimization]
**Learning:** `getAllSRs` was fetching unused `serviceCategory` fields (`handler`, `slaHours`), causing unnecessary joins. Removing them improves query performance.
**Action:** Review Prisma `include` and `select` clauses to ensure only consumed fields are fetched.
