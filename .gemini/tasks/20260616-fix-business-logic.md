# Task: Fix Business Logic & Architecture Issues

## Checklist

- [x] Move `domainEvents.emit` and `emitRealtimeEvent` outside the Prisma transaction in `updateSR` (`src/services/sr.service.ts`).
- [x] Support null assignee updates in `domainEvents` and `sr:assigned` listener for unassignment detection.
- [x] Move `getSRActivitiesAction` and `getSRCommentsAction` database logic to `SRService` methods and clean up dynamic imports.
- [x] Remove redundant dynamic imports of logger in `sr.service.ts`.
- [x] Run type-checks and tests to verify correctness.
