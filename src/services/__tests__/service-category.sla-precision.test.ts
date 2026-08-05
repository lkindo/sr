/**
 * SLA 마감일 계산 정밀도 회귀 테스트 (감사 4.3).
 *
 * 예전 구현은 `dueDate.setHours(dueDate.getHours() + adjustedHours)` 였다.
 * `setHours` 는 인자에 `ToIntegerOrInfinity` 를 적용하므로 **소수 시간이 절삭**된다.
 * 우선순위 배율이 0.5 / 0.75 / 1.0 / 1.5 라 `adjustedHours` 는 자주 소수이고,
 * 그때마다 SLA 가 최대 59분 짧아졌다 — 계약보다 이른 마감일이 지연 집계를 오염시킨다.
 */
import { SRPriority } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: { serviceCategory: { findUnique: vi.fn() } },
}));

import { ServiceCategoryService } from '@/services/service-category.service';

const service = new ServiceCategoryService();
const START = new Date('2026-08-05T00:00:00.000Z');

/** 두 시각의 차이를 분으로. */
const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;

describe('calculateDueDateFromHours — 소수 시간을 보존한다', () => {
  it('slaHours 5 × CRITICAL(0.5) = 2.5시간 → 150분 (예전에는 120분)', () => {
    const due = service.calculateDueDateFromHours(5, SRPriority.CRITICAL, START);

    // 이것이 정확히 감사가 지적한 사례다. 30분이 조용히 사라졌었다.
    expect(minutesBetween(START, due)).toBe(150);
  });

  it('slaHours 3 × HIGH(0.75) = 2.25시간 → 135분', () => {
    const due = service.calculateDueDateFromHours(3, SRPriority.HIGH, START);

    expect(minutesBetween(START, due)).toBe(135);
  });

  it('slaHours 1 × HIGH(0.75) = 45분 (예전에는 0분 — 즉시 지연)', () => {
    const due = service.calculateDueDateFromHours(1, SRPriority.HIGH, START);

    // 절삭되면 0시간이 되어 생성 즉시 SLA 위반으로 집계됐다.
    expect(minutesBetween(START, due)).toBe(45);
    expect(due.getTime()).toBeGreaterThan(START.getTime());
  });

  it('정수 시간은 그대로다(회귀 없음)', () => {
    const due = service.calculateDueDateFromHours(8, SRPriority.MEDIUM, START);

    expect(minutesBetween(START, due)).toBe(8 * 60);
  });

  it('startDate 를 변경하지 않는다(원본 보존)', () => {
    const start = new Date(START);
    service.calculateDueDateFromHours(5, SRPriority.CRITICAL, start);

    // `new Date(startDate)` 후 setHours 를 쓰던 옛 구현도 복사는 했지만,
    // 계산 방식을 바꾸면서 이 성질이 깨지지 않았는지 못 박아 둔다.
    expect(start.getTime()).toBe(START.getTime());
  });

  it('DST 경계에서도 경과 시간이 벽시계가 아니라 실제 시간이다', () => {
    // 밀리초 산술의 부수 효과: 로컬 타임존의 DST 전환이 SLA 길이를 바꾸지 않는다.
    // `setHours` 는 벽시계 기준이라 전환일에 1시간이 늘거나 줄었다.
    const beforeDst = new Date('2026-03-08T09:00:00.000Z');
    const due = service.calculateDueDateFromHours(4, SRPriority.MEDIUM, beforeDst);

    expect(minutesBetween(beforeDst, due)).toBe(240);
  });
});

describe('calculateDueDate — 계산 구현을 공유한다', () => {
  it('DB 조회 후 calculateDueDateFromHours 와 같은 결과를 낸다', async () => {
    const { default: prisma } = await import('@/lib/prisma');
    vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ slaHours: 5 } as never);

    const viaDb = await service.calculateDueDate('cat-1', SRPriority.CRITICAL, START);
    const direct = service.calculateDueDateFromHours(5, SRPriority.CRITICAL, START);

    // 두 경로가 갈라지면 "어느 쪽으로 접수했는가"에 따라 마감일이 달라진다.
    expect(viaDb.getTime()).toBe(direct.getTime());
  });
});
