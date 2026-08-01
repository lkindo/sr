import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';
import { ClientService } from '@/services/client.service';

/**
 * 감사 3.18 회귀 테스트 — 신규 고객사의 기본 카테고리.
 *
 * SR 의 `serviceCategoryId` 는 스키마상 non-nullable 이고 생성 폼도 카테고리를 하드 요구한다.
 * 따라서 카테고리가 0개인 고객사는 **구조적으로 SR 을 한 건도 받을 수 없다** —
 * 목록에는 보이고 사용자 배정도 되지만 실제로는 막다른 길이다.
 */

vi.mock('@/lib/prisma', () => ({
  default: {
    client: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    serviceCategory: { create: vi.fn() },
    $transaction: vi.fn((cb: any) => cb(prisma)),
  },
}));

const VALID_CLIENT = {
  code: 'ACME',
  name: '에이스 주식회사',
};

const CREATED_CLIENT = { id: 'client-new', ...VALID_CLIENT };

describe('ClientService.createClient — 기본 서비스 카테고리 시드', () => {
  let service: ClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClientService();
    (prisma.client.findUnique as any).mockResolvedValue(null); // 코드 중복 없음
    (prisma.client.create as any).mockResolvedValue(CREATED_CLIENT);
    (prisma.serviceCategory.create as any).mockResolvedValue({ id: 'cat-default' });
  });

  it('고객사를 만들면 기본 카테고리도 함께 생성한다', async () => {
    await service.createClient(VALID_CLIENT);

    expect(prisma.serviceCategory.create).toHaveBeenCalledTimes(1);
    const args = (prisma.serviceCategory.create as any).mock.calls[0][0];
    expect(args.data.clientId).toBe('client-new');
    expect(args.data.categoryName).toBe('일반 요청');
    expect(args.data.isActive).toBe(true);
  });

  it('기본 카테고리는 SLA 24시간 / MEDIUM 우선순위다', async () => {
    await service.createClient(VALID_CLIENT);

    const args = (prisma.serviceCategory.create as any).mock.calls[0][0];
    expect(args.data.slaHours).toBe(24);
    expect(args.data.priority).toBe('MEDIUM');
  });

  it('고객사 생성과 같은 트랜잭션에서 만든다', async () => {
    await service.createClient(VALID_CLIENT);

    // 트랜잭션 밖이면 카테고리 생성만 실패해도 "SR 을 받을 수 없는 고객사"가 남는다.
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('생성된 고객사를 그대로 반환한다', async () => {
    const result = await service.createClient(VALID_CLIENT);

    expect(result).toEqual(CREATED_CLIENT);
  });

  it('코드가 중복이면 고객사도 카테고리도 만들지 않는다', async () => {
    (prisma.client.findUnique as any).mockResolvedValue({ id: 'existing', code: 'ACME' });

    await expect(service.createClient(VALID_CLIENT)).rejects.toThrow();

    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(prisma.serviceCategory.create).not.toHaveBeenCalled();
  });
});
