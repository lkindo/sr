import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferentialIntegrityError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { ClientService } from '@/services/client.service';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    serviceCategory: { findMany: vi.fn(), count: vi.fn() },
    userClient: { count: vi.fn() },
    sR: { count: vi.fn() },
    clientHandler: { count: vi.fn() },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

describe('ClientService Coverage', () => {
  let clientService: ClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    clientService = new ClientService();
  });

  describe('getClientByCode', () => {
    it('finds client by code', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c1', code: 'C1' } as any);
      const result = await clientService.getClientByCode('C1');
      expect(result).toEqual({ id: 'c1', code: 'C1' });
    });
  });

  describe('getClientsForSelection', () => {
    // 이 필터가 없던 시절, 비활성화한 고객사가 SR 등록·수정 다이얼로그의 선택지에
    // 그대로 남아 있었다. 고객사 비활성화가 신규 SR 에 대해 무의미해진다.
    it('비활성 고객사를 제외한다', async () => {
      vi.mocked(prisma.client.findMany).mockResolvedValue([] as any);

      await clientService.getClientsForSelection();

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { OR: [{ isActive: true }] } })
      );
    });

    it('includeId 로 지정한 고객사는 비활성이어도 남긴다', async () => {
      vi.mocked(prisma.client.findMany).mockResolvedValue([] as any);

      await clientService.getClientsForSelection(undefined, { includeId: 'c-off' });

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { OR: [{ isActive: true }, { id: 'c-off' }] } })
      );
    });

    it('테넌트 스코프는 활성 조건과 AND 로 함께 걸린다', async () => {
      vi.mocked(prisma.client.findMany).mockResolvedValue([] as any);

      await clientService.getClientsForSelection(['c1', 'c2']);

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ isActive: true }], id: { in: ['c1', 'c2'] } },
        })
      );
    });
  });

  describe('getClientDetailsById', () => {
    it('fetches detailed client info', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c1', srs: [] } as any);
      await clientService.getClientDetailsById('c1');
      expect(prisma.client.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          include: expect.objectContaining({
            users: expect.anything(),
            // 감사 3.6: 전체 SR 본문 덤프(`srs: true`) 대신 제한된 요약만 조회한다.
            srs: {
              select: {
                id: true,
                srNumber: true,
                title: true,
                status: true,
                priority: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          }),
        })
      );
    });

    // 회귀 방지: SR 목록이 다시 무제한/전체 컬럼 조회로 되돌아가지 못하도록 고정한다.
    it('SR 조회는 명시적 select + 정렬 + take 상한으로 제한된다', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c1', srs: [] } as any);
      await clientService.getClientDetailsById('c1');

      const args = vi.mocked(prisma.client.findUnique).mock.calls[0]![0] as any;
      const srs = args.include.srs;

      // `srs: true`(전체 행 덤프)가 아니라 옵션 객체여야 한다.
      expect(srs).not.toBe(true);
      expect(typeof srs).toBe('object');

      // 상한(take)이 반드시 존재하며 유한한 값이어야 한다.
      expect(srs.take).toBe(10);
      expect(srs.orderBy).toEqual({ createdAt: 'desc' });

      // 명시적 select 여야 하며, include 로 관계를 끌어오면 안 된다.
      expect(srs.select).toBeDefined();
      expect(srs.include).toBeUndefined();
    });

    it('SR select 에 설명/처리결과/반려사유 등 민감 자유서술 컬럼이 포함되지 않는다', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c1', srs: [] } as any);
      await clientService.getClientDetailsById('c1');

      const args = vi.mocked(prisma.client.findUnique).mock.calls[0]![0] as any;
      const selectedKeys = Object.keys(args.include.srs.select);

      const sensitiveKeys = [
        'description',
        'resolution',
        'resolutionNote',
        'rejectionReason',
        'rejectReason',
        'holdReason',
        'attachments',
        'comments',
        'activities',
        'statusHistory',
      ];
      for (const key of sensitiveKeys) {
        expect(selectedKeys).not.toContain(key);
      }

      // 안전한 요약 컬럼만 선택되었는지도 함께 확인한다(허용 목록 밖 컬럼 차단).
      expect(selectedKeys.sort()).toEqual(
        ['createdAt', 'id', 'priority', 'srNumber', 'status', 'title'].sort()
      );
    });
  });

  describe('getClientWithDetailsAndCategories', () => {
    it('returns null if client not found', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue(null);
      const result = await clientService.getClientWithDetailsAndCategories('c1');
      expect(result).toBeNull();
    });

    it('filters out ADMIN users from result', async () => {
      const mockClient = {
        id: 'c1',
        users: [
          { user: { id: 'admin', roles: [{ role: { name: 'ADMIN' } }] } },
          { user: { id: 'user', roles: [{ role: { name: 'CLIENT_USER' } }] } },
        ],
      };
      vi.mocked(prisma.client.findUnique).mockResolvedValue(mockClient as any);
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([]);

      const result = await clientService.getClientWithDetailsAndCategories('c1');

      expect(result).not.toBeNull();
      expect(result?.users).toHaveLength(1);
      expect(result?.users[0].user.id).toBe('user');
    });

    // ── 테넌트 유출 회귀 가드 ────────────────────────────────────────────
    // 예전에는 이 메서드가 serviceCategoryService.getActiveCategories() 로
    // **전 고객사의** 활성 카테고리를 가져와, 관계로 이미 스코프된 값을 덮어썼다.
    // 그 조회에는 clientId 필터가 없고 client 관계까지 include 해서, 자사 상세를
    // 여는 것만으로 타 고객사의 카테고리명·고객사명·코드가 응답에 실려 나갔다.
    // 실측(CLIENT_ADMIN/TEST001): 5건 중 2건이 TEST002 의 것이었다.
    it('관계로 스코프된 카테고리를 그대로 돌려준다 — 전역 조회로 덮어쓰지 않는다', async () => {
      const own = [{ id: 'cat-own', categoryName: '자사 분류', clientId: 'c1' }];
      vi.mocked(prisma.client.findUnique).mockResolvedValue({
        id: 'c1',
        users: [],
        serviceCategories: own,
      } as never);
      // 이 메서드가 카테고리를 **다시 조회하면** 아래 목이 응답에 섞여 들어온다.
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([
        { id: 'cat-other', categoryName: '남의 분류', clientId: 'c2' },
      ] as never);

      const result = await clientService.getClientWithDetailsAndCategories('c1');

      expect(result?.serviceCategories).toEqual(own);
      expect(
        prisma.serviceCategory.findMany,
        'serviceCategory 를 별도 조회하면 테넌트 스코프가 사라진다.'
      ).not.toHaveBeenCalled();
    });

    it('상세 조회가 카테고리를 이 고객사로만 스코프하고 담당자까지 가져온다', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c1', users: [] } as never);

      await clientService.getClientWithDetailsAndCategories('c1');

      // 관계 조회이므로 clientId 필터는 Prisma 가 붙인다. 여기서 고정할 것은
      // (1) where 로 c1 을 찍었는가, (2) 화면이 쓰는 handler 를 함께 가져오는가.
      expect(prisma.client.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          include: expect.objectContaining({
            serviceCategories: expect.objectContaining({
              include: expect.objectContaining({ handler: expect.anything() }),
            }),
          }),
        })
      );
    });
  });
});
