## 2024-05-22 - Over-fetching in List Views
**Learning:** `SRService.getAllSRs` was fetching nested `serviceCategory.handler` data which was unused by the `SRListItem` type consumers (specifically `SRsDataTable`).
**Action:** Always verify if nested relations in Prisma `include` are actually consumed by the frontend. Use specific `select` blocks to exclude unused relations in list queries.
