import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
const origin = 'https://sr.example.test';

interface WorkerEvent {
  request: Pick<Request, 'url' | 'method' | 'mode' | 'headers'>;
  respondWith: ReturnType<typeof vi.fn>;
  waitUntil: ReturnType<typeof vi.fn>;
}

function createWorker() {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const cache = {
    add: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue(['sr-mgt-cache-v4', 'sr-mgt-cache-v5', 'other-app-cache']),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockResolvedValue(
    Object.defineProperty(
      new Response('image bytes', { headers: { 'Content-Type': 'image/png' } }),
      'type',
      {
        value: 'basic',
      }
    )
  );
  const self = {
    location: { origin },
    addEventListener: (name: string, handler: (event: WorkerEvent) => void) =>
      handlers.set(name, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    registration: {
      navigationPreload: {
        enable: vi.fn().mockResolvedValue(undefined),
        disable: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
  runInNewContext(source, { self, caches, fetch, URL, console: { log: vi.fn(), warn: vi.fn() } });

  const dispatch = (name: string, path = '/', overrides: Partial<WorkerEvent['request']> = {}) => {
    const event: WorkerEvent = {
      request: {
        url: new URL(path, origin).href,
        method: 'GET',
        mode: 'cors',
        headers: new Headers(),
        ...overrides,
      },
      respondWith: vi.fn(),
      waitUntil: vi.fn(),
    };
    const handler = handlers.get(name);
    if (!handler) throw new Error(`Missing ${name} handler`);
    handler(event);
    return event;
  };
  return { dispatch, caches, cache, fetch, self };
}

describe('모바일 Service Worker 캐시 경계', () => {
  it.each([
    ['/register?_rsc=stale', {}],
    ['/my-requests', { headers: new Headers({ RSC: '1' }) }],
    ['/dashboard', { mode: 'navigate' as const }],
    ['/login', { headers: new Headers({ accept: 'text/html' }) }],
    ['/api/srs', {}],
    ['/manifest.json', {}],
    ['/_next/static/chunks/development.js', {}],
    ['https://other.example/icon.png', {}],
    ['/icons/icon-192x192.png', { method: 'POST' }],
  ])('%s 응답은 가로채거나 캐시하지 않는다', (path, overrides) => {
    const worker = createWorker();
    const event = worker.dispatch('fetch', path, overrides);
    expect(event.respondWith).not.toHaveBeenCalled();
    expect(worker.caches.open).not.toHaveBeenCalled();
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it('설치할 때 인증된 화면 대신 공개 정적 이미지만 준비한다', async () => {
    const worker = createWorker();
    const event = worker.dispatch('install');
    await event.waitUntil.mock.calls[0]![0];
    expect(worker.cache.add.mock.calls.map(([path]) => path).sort()).toEqual([
      '/favicon.ico',
      '/icons/icon-192x192.png',
      '/icons/icon-512x512.png',
    ]);
  });

  it('허용된 아이콘만 현재 앱 캐시에 저장하고 다음 조회에 재사용한다', async () => {
    const worker = createWorker();
    const first = worker.dispatch('fetch', '/icons/icon-192x192.png');
    const response = await first.respondWith.mock.calls[0]![0];
    await Promise.all(first.waitUntil.mock.calls.map(([promise]) => promise));
    expect(worker.fetch).toHaveBeenCalledOnce();
    expect(worker.cache.put).toHaveBeenCalledWith(first.request, expect.any(Response));

    worker.cache.match.mockResolvedValue(response);
    worker.caches.match.mockResolvedValue(response);
    const second = worker.dispatch('fetch', '/icons/icon-192x192.png');
    expect(await second.respondWith.mock.calls[0]![0]).toBe(response);
    expect(worker.fetch).toHaveBeenCalledOnce();
  });

  it.each([
    {
      label: '로그인 HTML',
      status: 200,
      contentType: 'text/html',
      cacheControl: 'public',
      redirected: false,
    },
    {
      label: '실패 응답',
      status: 503,
      contentType: 'image/png',
      cacheControl: 'public',
      redirected: false,
    },
    {
      label: '비공개 응답',
      status: 200,
      contentType: 'image/png',
      cacheControl: 'private',
      redirected: false,
    },
    {
      label: '리다이렉트',
      status: 200,
      contentType: 'image/png',
      cacheControl: 'public',
      redirected: true,
    },
  ])(
    '정적 경로에서도 $label 은 저장하지 않는다',
    async ({ status, contentType, cacheControl, redirected }) => {
      const worker = createWorker();
      worker.fetch.mockResolvedValue(
        Object.defineProperties(
          new Response('uncacheable', {
            status,
            headers: { 'Content-Type': contentType, 'Cache-Control': cacheControl },
          }),
          { type: { value: 'basic' }, redirected: { value: redirected } }
        )
      );
      const event = worker.dispatch('fetch', '/icons/icon-192x192.png');
      await event.respondWith.mock.calls[0]![0];
      await Promise.all(event.waitUntil.mock.calls.map(([promise]) => promise));
      expect(worker.cache.put).not.toHaveBeenCalled();
    }
  );

  it('업그레이드는 이전 SR 캐시만 지우고 다른 앱 캐시를 보존한다', async () => {
    const worker = createWorker();
    const event = worker.dispatch('activate');
    await event.waitUntil.mock.calls[0]![0];
    expect(worker.caches.delete.mock.calls).toEqual([['sr-mgt-cache-v4']]);
    expect(worker.self.registration.navigationPreload.disable).toHaveBeenCalledOnce();
    expect(worker.self.clients.claim).toHaveBeenCalledOnce();
  });
});
