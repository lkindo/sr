import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();

async function runBenchmark() {
  console.log('Starting benchmark...');

  // 1. Setup
  const user = await prisma.user.create({
    data: {
      email: `bench_${Date.now()}@example.com`,
      name: 'Benchmark User',
      password: 'password',
    },
  });

  const client = await prisma.client.create({
    data: {
        code: `BENCH_${Date.now()}`,
        name: 'Benchmark Client',
    }
  });

  const category = await prisma.serviceCategory.create({
    data: {
        categoryName: 'Benchmark Category',
        slaHours: 24,
    }
  });

  const sr = await prisma.sR.create({
    data: {
      srNumber: `SR-BENCH-${Date.now()}`,
      title: 'Benchmark SR',
      description: 'Testing attachment inserts',
      requesterId: user.id,
      clientId: client.id,
      serviceCategoryId: category.id,
    },
  });

  const ITERATIONS = 50;
  const BATCH_SIZE = 10;

  // 2. Benchmark Baseline (N+1 inserts)
  console.log(`\nBenchmarking Baseline (N+1 inserts) - ${ITERATIONS} batches of ${BATCH_SIZE} files...`);
  const startBaseline = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const batch = Array.from({ length: BATCH_SIZE }, (_, j) => ({
        srId: sr.id,
        fileName: `base_file_${i}_${j}.txt`,
        fileSize: 1024,
        fileType: 'text/plain',
        fileUrl: `/uploads/attachments/base_${i}_${j}.txt`,
        storagePath: `/tmp/base_${i}_${j}.txt`,
        uploadedBy: user.id,
    }));
    await Promise.all(batch.map(d => prisma.sRAttachment.create({ data: d })));
  }
  const endBaseline = performance.now();
  const baselineDuration = endBaseline - startBaseline;

  // Cleanup attachments
  await prisma.sRAttachment.deleteMany({ where: { srId: sr.id } });

  // 3. Benchmark Optimized (createManyAndReturn)
  console.log(`\nBenchmarking Optimized (createManyAndReturn) - ${ITERATIONS} batches of ${BATCH_SIZE} files...`);
  const startOptimized = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const batch = Array.from({ length: BATCH_SIZE }, (_, j) => ({
        srId: sr.id,
        fileName: `opt_file_${i}_${j}.txt`,
        fileSize: 1024,
        fileType: 'text/plain',
        fileUrl: `/uploads/attachments/opt_${i}_${j}.txt`,
        storagePath: `/tmp/opt_${i}_${j}.txt`,
        uploadedBy: user.id,
    }));
    await prisma.sRAttachment.createManyAndReturn({ data: batch });
  }
  const endOptimized = performance.now();
  const optimizedDuration = endOptimized - startOptimized;

  // 4. Report
  console.log('\nResults:');
  console.log(`Baseline (Total): ${baselineDuration.toFixed(2)}ms`);
  console.log(`Baseline (Avg/Batch): ${(baselineDuration / ITERATIONS).toFixed(2)}ms`);
  console.log(`Optimized (Total): ${optimizedDuration.toFixed(2)}ms`);
  console.log(`Optimized (Avg/Batch): ${(optimizedDuration / ITERATIONS).toFixed(2)}ms`);
  console.log(`Improvement: ${((baselineDuration - optimizedDuration) / baselineDuration * 100).toFixed(2)}%`);

  // 5. Cleanup
  await prisma.sRAttachment.deleteMany({ where: { srId: sr.id } });
  await prisma.sR.delete({ where: { id: sr.id } });
  await prisma.serviceCategory.delete({ where: { id: category.id } });
  await prisma.client.delete({ where: { id: client.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

runBenchmark()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
