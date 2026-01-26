import { performance } from 'perf_hooks';

import { validateFile } from '@/lib/file-validator';

async function runBenchmark() {
  const FILE_SIZE = 9.5 * 1024 * 1024; // 9.5MB
  const ITERATIONS = 50;

  // Create a buffer with PNG signature
  const buffer = new Uint8Array(FILE_SIZE);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);

  const file = new File([buffer], 'test.png', { type: 'image/png' });

  console.log(
    `Running benchmark with ${ITERATIONS} iterations on ${FILE_SIZE / 1024 / 1024}MB file...`
  );

  if (global.gc) {
    global.gc();
  }

  const start = performance.now();

  for (let i = 0; i < ITERATIONS; i++) {
    try {
      await validateFile(file);
    } catch (error) {
      console.error('Validation failed:', error);
    }
  }

  const end = performance.now();

  console.log(`Total time: ${(end - start).toFixed(2)}ms`);
  console.log(`Average time: ${((end - start) / ITERATIONS).toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
