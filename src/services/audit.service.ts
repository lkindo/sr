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

export class AuditService {
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
