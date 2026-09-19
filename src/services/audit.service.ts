import type { Prisma } from '@prisma/client';

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

export interface AuditLogData {
  userId?: string | null;
  actionType: string;
  targetEntity: string;
  targetId?: string | null;
  changes: Record<string, any> | string;
  ipAddress?: string | null;
}

/** 감사 로그 조회 조건. 비어 있는 값은 조건에서 뺀다. */
export interface AuditLogFilter {
  actionType?: string;
  targetEntity?: string;
  targetId?: string;
  /** 행위자 이름·이메일 부분 일치. */
  actor?: string;
  /** 이 시각 이후(포함). */
  from?: Date;
  /** 이 시각 이전(제외). */
  to?: Date;
}

export class AuditService {
  /**
   * 감사 로그를 최근 것부터 조회한다 — 헌법 §1.1 "ADMIN 은 전체 감사 로그를 조회할 수 있다" 를 이행한다
   * (2026-09-18 소유자 결정 D11). 예전에는 읽는 코드가 0건이라 서버에 SSH 로 들어가 SQL 을 쳐야 했다.
   * 인가는 호출하는 라우트가 policies.ensureCanViewAuditLogs 로 판정한다.
   *
   * 행위자가 비어 있는 행(영구 삭제된 사용자·시스템 호출)은 user 가 null 로 온다. 화면이 '삭제된 사용자' 로 보인다.
   * facets 는 필터 선택지다 — 행위 어휘가 일반형(CREATE 등)과 접두형(ROLE_CREATE 등)으로 섞여 있어 고정 목록을
   * 두지 않고 실제로 쌓인 값을 쓴다.
   */
  async listLogs(filter: AuditLogFilter, page: { skip: number; take: number }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.actionType ? { actionType: filter.actionType } : {}),
      ...(filter.targetEntity ? { targetEntity: filter.targetEntity } : {}),
      ...(filter.targetId ? { targetId: filter.targetId } : {}),
      ...(filter.actor
        ? {
            user: {
              OR: [
                { name: { contains: filter.actor, mode: 'insensitive' as const } },
                { email: { contains: filter.actor, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
    };

    const [rows, total, actionTypes, targetEntities] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: page.skip,
        take: page.take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          actionType: true,
          targetEntity: true,
          targetId: true,
          changes: true,
          ipAddress: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({ by: ['actionType'], orderBy: { actionType: 'asc' } }),
      prisma.auditLog.groupBy({ by: ['targetEntity'], orderBy: { targetEntity: 'asc' } }),
    ]);

    return {
      rows,
      total,
      facets: {
        actionTypes: actionTypes.map((row) => row.actionType),
        targetEntities: targetEntities.map((row) => row.targetEntity),
      },
    };
  }

  /**
   * 감사 로그를 영구 저장합니다.
   * 트랜잭션의 원자성을 보장하기 위해 Prisma 트랜잭션 클라이언트(tx)를 선택적으로 받습니다.
   */
  async createLog(tx: any, data: AuditLogData): Promise<void> {
    const client = tx || prisma;

    // changes 컬럼은 Prisma `Json`(jsonb) 타입이므로 객체를 그대로 전달해야 한다.
    // (과거에는 JSON.stringify 로 문자열을 넣어 jsonb 안에 JSON "문자열 스칼라"가
    //  저장되는 이중 인코딩 버그가 있었고, jsonb 경로 쿼리/인덱싱이 무력화되었다.)
    let changes: unknown = data.changes;
    if (typeof data.changes === 'string') {
      try {
        changes = JSON.parse(data.changes);
      } catch {
        changes = data.changes; // 유효한 JSON이 아니면 문자열 스칼라로 저장
      }
    }

    try {
      if (client.auditLog && typeof client.auditLog.create === 'function') {
        await client.auditLog.create({
          data: {
            userId: data.userId || null,
            actionType: data.actionType,
            targetEntity: data.targetEntity,
            targetId: data.targetId || null,
            changes,
            ipAddress: data.ipAddress || null,
          },
        });
      } else {
        logger.warn('[AuditService] auditLog.create is not defined on client. Skipping DB log.');
      }
    } catch (error) {
      logger.error('[AuditService] Failed to create audit log', error as Error, {
        actionType: data.actionType,
        targetEntity: data.targetEntity,
        targetId: data.targetId || undefined,
      });
      throw error; // 감사 로그 무결성 보장을 위해 예외 전파 (원자적 롤백 트리거)
    }
  }
}

export const auditService = new AuditService();
