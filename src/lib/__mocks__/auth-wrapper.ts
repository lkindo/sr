// Vitest mock for auth-wrapper to bypass NextAuth and rate‑limit logic in tests.
// Place this file under src/lib/__mocks__/auth-wrapper.ts so that Vitest/Jest
// automatically uses it when `vi.mock('@/lib/auth-wrapper')` is called.

export const withAuthAndRateLimit = (handler: any) => {
    // Return a wrapper that simply calls the original handler with a mocked
    // context containing a session. The session user id is "mock-user" which
    // matches the expectation in the permission‑check test.
    return async (request: any, context: any) => {
        const mockContext = {
            ...context,
            session: { user: { id: 'mock-user' } },
        };
        return handler(request, mockContext);
    };
};

// The other wrappers are not needed for the permission‑check test, but we
// provide simple pass‑through implementations for completeness.
export const withAuth = (handler: any) => handler;
export const withErrorHandler = (handler: any) => handler;
