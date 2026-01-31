# Bolt's Journal

This journal records critical learnings about performance optimizations in this codebase.

## 2025-02-23 - SR List Over-fetching
**Learning:** `SRListItem` type and `getAllSRs` query included deep nested relation `serviceCategory.handler`, but this data was unused in the list view components (`SRsDataTable`).
**Action:** Always verify if nested relations in Prisma `include` are actually consumed by the frontend components. Removing unused relations reduces query complexity and payload size.
