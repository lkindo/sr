# Task: Fix System Control & Middleware Security Issues

## Checklist

- [x] Fix memory leak in `MemoryRateLimiter` (`src/lib/rate-limiter.ts`) under Edge runtime using lazy eviction.
- [x] Add rate limiting support for Next.js Server Actions by checking `next-action` headers in `src/middleware.ts`.
- [x] Bind generated `nonce` properly in the CSP header configuration of `src/middleware.ts`.
- [x] Run type-checks and tests to verify middleware correctness.
