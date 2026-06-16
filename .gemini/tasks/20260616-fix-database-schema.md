# Task: Fix Database Schema Indexing Issues

## Checklist

- [x] Add `@@index([srId, isInternal, createdAt])` to `SRComment` model in `prisma/schema.prisma`.
- [x] Add `@@index([recipient, createdAt])` to `Notification` model in `prisma/schema.prisma`.
- [x] Generate Prisma client and run local schema synchronization/validation.
- [x] Run typescript checks and tests to verify.
