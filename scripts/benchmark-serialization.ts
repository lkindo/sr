
import { performance } from 'perf_hooks';
import { serializeResponse } from '@/lib/serialization';

// Create a large, complex object to benchmark serialization
const largeObject = {
  id: 1,
  name: "Benchmark Object",
  createdAt: new Date(),
  updatedAt: new Date(),
  nested: {
    dates: Array.from({ length: 100 }, () => new Date()),
    mixed: [1, "string", null, undefined, { date: new Date() }, NaN, Infinity, -Infinity],
    deep: {
      a: {
        b: {
          c: {
            d: new Date(),
            e: [new Date(), new Date()],
            f: { g: undefined, h: null, i: () => {} }
          }
        }
      }
    }
  },
  items: Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    date: new Date(),
    value: Math.random(),
    metadata: {
      tags: ["a", "b", "c"],
      created: new Date(),
      status: i % 2 === 0 ? "active" : "inactive"
    }
  }))
};

async function benchmark() {
  const ITERATIONS = 1000;
  console.log(`Starting benchmark with ${ITERATIONS} iterations...`);

  // Warmup
  for (let i = 0; i < 100; i++) {
    serializeResponse(largeObject);
  }

  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    serializeResponse(largeObject);
  }
  const end = performance.now();

  const totalTime = end - start;
  const avgTime = totalTime / ITERATIONS;

  console.log(`Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`Average time per iteration: ${avgTime.toFixed(4)}ms`);

  // Verify correctness on a smaller scale
  const testObj = {
      date: new Date('2023-01-01T00:00:00Z'),
      nan: NaN,
      inf: Infinity,
      undef: undefined,
      fn: () => {},
      arr: [undefined, NaN, Infinity, new Date('2023-01-01T00:00:00Z')]
  };

  const serialized = serializeResponse(testObj);
  console.log('Verification Output:', JSON.stringify(serialized));

  // Expected behavior check
  const expected = JSON.parse(JSON.stringify(testObj)); // Current implementation behavior
  // Note: JSON.stringify converts Date to string, NaN/Infinity to null, undefined/fn to skipped (in obj) or null (in arr)

  if (JSON.stringify(serialized) === JSON.stringify(expected)) {
      console.log('Verification: MATCHES expected JSON behavior');
  } else {
      console.error('Verification: MISMATCH');
      console.error('Expected:', JSON.stringify(expected));
      console.error('Actual:  ', JSON.stringify(serialized));
  }
}

benchmark().catch(console.error);
