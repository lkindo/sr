
/**
 * Benchmark for Dashboard Stats (In-Memory vs DB Aggregation simulation)
 *
 * This script demonstrates the CPU cost of calculating stats in-memory for large datasets.
 * The optimization moves this calculation to the database, eliminating this cost
 * and significantly reducing data transfer.
 *
 * Usage: npx tsx scripts/benchmark-dashboard-stats.ts
 */

import { performance } from 'perf_hooks';

// Simulate the data structure returned by Prisma
interface SR {
  intakeAt: Date | null;
  completedAt: Date | null;
  dueDate: Date | null;
  serviceCategory: {
    slaHours: number | null;
  } | null;
}

function generateMockData(count: number): SR[] {
  const data: SR[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const intakeAt = new Date(now.getTime() - Math.random() * 100000000);
    const completedAt = new Date(intakeAt.getTime() + Math.random() * 86400000 * 2); // 0-2 days later
    // 80% have due date
    const hasDueDate = Math.random() > 0.2;
    const dueDate = hasDueDate ? new Date(intakeAt.getTime() + 86400000) : null;

    data.push({
      intakeAt,
      completedAt,
      dueDate,
      serviceCategory: { slaHours: 24 }
    });
  }
  return data;
}

function calculateStatsInMemory(completedSRsWithDates: SR[]) {
  // 평균 처리 시간 계산 (접수부터 완료까지)
  let avgProcessingHours = 0;
  if (completedSRsWithDates.length > 0) {
    const totalHours = completedSRsWithDates.reduce((sum, sr) => {
      if (sr.intakeAt && sr.completedAt) {
        const hours = (sr.completedAt.getTime() - sr.intakeAt.getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }
      return sum;
    }, 0);
    avgProcessingHours = totalHours / completedSRsWithDates.length;
  }

  // SLA 준수율 계산
  let slaComplianceRate = 0;
  if (completedSRsWithDates.length > 0) {
    const compliantCount = completedSRsWithDates.filter((sr) => {
      if (!sr.dueDate || !sr.completedAt) return false;
      return sr.completedAt <= sr.dueDate;
    }).length;
    slaComplianceRate = (compliantCount / completedSRsWithDates.length) * 100;
  }

  return { avgProcessingHours, slaComplianceRate };
}

function runBenchmark() {
  const counts = [1000, 10000, 50000, 100000];

  console.log('Running benchmark for in-memory stats calculation...');
  console.log('--------------------------------------------------');
  console.log('| Records | Time (ms) | Avg Processing Hours | SLA Compliance |');
  console.log('|---------|-----------|----------------------|----------------|');

  for (const count of counts) {
    const data = generateMockData(count);

    const start = performance.now();
    const result = calculateStatsInMemory(data);
    const end = performance.now();

    console.log(`| ${count.toString().padEnd(7)} | ${(end - start).toFixed(4).padEnd(9)} | ${result.avgProcessingHours.toFixed(2).padEnd(20)} | ${result.slaComplianceRate.toFixed(2).padEnd(14)} |`);
  }
  console.log('--------------------------------------------------');
}

runBenchmark();
