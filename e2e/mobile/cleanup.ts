import { Prisma, PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import assert from 'node:assert/strict';

const localDatabaseHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const maxRunAgeMs = 24 * 60 * 60 * 1000;
const clockToleranceMs = 60 * 1000;

function mobileRunWindow(prefix: string) {
  const marker = /^MOBILE-E2E-(\d{13})-[a-zA-Z0-9_-]+-(light|dark)$/.exec(prefix);
  assert.ok(marker, 'A complete, unique mobile test prefix is required.');
  const startedAt = Number(marker[1]);
  const now = Date.now();
  assert.ok(
    startedAt >= now - maxRunAgeMs && startedAt <= now + clockToleranceMs,
    'Only mobile test runs from the last 24 hours may be inspected or cleaned.'
  );
  return { startedAt, now };
}

/** Validate the local database before any mobile test can create business records. */
export function assertLocalMobileDatabase(): string {
  // Respect an already supplied DATABASE_URL and Next's local development env precedence.
  dotenv.config({
    path: ['.env.development.local', '.env.local', '.env.development', '.env'],
    quiet: true,
  });
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL is required for mobile tests.');
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error('Mobile tests require a valid local PostgreSQL URL.');
  }
  assert.ok(
    ['postgres:', 'postgresql:'].includes(database.protocol) &&
      localDatabaseHosts.has(database.hostname) &&
      !database.searchParams.has('host') &&
      !database.searchParams.has('hostaddr'),
    'Mobile tests are restricted to a loopback PostgreSQL database.'
  );
  return databaseUrl;
}

/** Discover this run's records even if the UI response was lost after a successful save. */
export async function findMobileRunRequests(
  prefix: string
): Promise<{ id: string; title: string; deletedAt: Date | null }[]> {
  const { startedAt, now } = mobileRunWindow(prefix);
  const databaseUrl = assertLocalMobileDatabase();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  try {
    return await prisma.sR.findMany({
      where: {
        OR: [{ title: prefix }, { title: { startsWith: `${prefix}-` } }],
        createdAt: {
          gte: new Date(startedAt - clockToleranceMs),
          lte: new Date(now + clockToleranceMs),
        },
      },
      select: { id: true, title: true, deletedAt: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** Remove only unsent emails belonging to this mobile test's explicit SR IDs. */
export async function cleanupMobileOutbox(ids: string[], prefix: string): Promise<number> {
  const { startedAt, now } = mobileRunWindow(prefix);
  assert.ok(
    ids.every((id) => id.length > 0 && id.trim() === id),
    'Explicit SR IDs are required.'
  );
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return 0;
  const databaseUrl = assertLocalMobileDatabase();

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  try {
    return await prisma.$transaction(async (tx) => {
      // Soft-deleted SRs remain available here so earlier failed runs can be cleaned too.
      const records = await tx.sR.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, title: true, createdAt: true },
      });
      assert.equal(records.length, uniqueIds.length, 'Every requested SR must exist.');
      assert.ok(
        records.every(
          (record) =>
            (record.title === prefix || record.title.startsWith(`${prefix}-`)) &&
            record.createdAt.getTime() >= startedAt - clockToleranceMs &&
            record.createdAt.getTime() <= now + clockToleranceMs
        ),
        'Every SR must match this mobile test prefix and run creation window.'
      );

      const where: Prisma.NotificationWhereInput = {
        type: 'EMAIL',
        status: 'PENDING',
        OR: uniqueIds.map((id) => ({ metadata: { path: ['srId'], equals: id } })),
      };
      const removed = await tx.notification.deleteMany({ where });
      assert.equal(
        await tx.notification.count({ where }),
        0,
        'Pending emails remain for this mobile test run.'
      );
      return removed.count;
    });
  } finally {
    await prisma.$disconnect();
  }
}
