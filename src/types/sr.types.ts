// src/types/sr.types.ts
import type { SR } from '@prisma/client';

/**
 * SR 상세 정보 타입
 * - SR 기본 정보 + 관련 엔티티 (고객사, 요청자, 담당자, 서비스 카테고리 등)
 * - 댓글, 활동, 첨부파일, 상태 이력 포함
 */
export type SRDetails = SR & {
  client: { id: string; code: string; name: string };
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
  intakeBy: { id: string; name: string; email: string; image: string | null } | null;
  serviceCategory: {
    id: string;
    categoryName: string;
    slaHours: number;
    handlerId?: string | null;
    handler?: { id: string; name: string } | null;
  };
  comments: (import('@prisma/client').SRComment & {
    user: { id: string; name: string; image: string | null };
  })[];
  activities: (import('@prisma/client').SRActivity & {
    user: { id: string; name: string; image: string | null };
  })[];
  attachments: import('@prisma/client').SRAttachment[];
  statusHistory: (import('@prisma/client').SRStatusHistory & {
    user: { id: string; name: string; image: string | null };
  })[];
  _count: { comments: number; attachments: number };
};

/**
 * SR 생성 시 반환 타입
 */
export type SRCreateResult = SR & {
  client: { id: string; code: string; name: string };
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
  serviceCategory: {
    id: string;
    categoryName: string;
    slaHours: number;
    handlerId?: string | null;
    handler?: { id: string; name: string } | null;
  };
  comments: (import('@prisma/client').SRComment & {
    user: { id: string; name: string; image: string | null };
  })[];
  activities: (import('@prisma/client').SRActivity & {
    user: { id: string; name: string; image: string | null };
  })[];
  attachments: import('@prisma/client').SRAttachment[];
  _count: { comments: number; attachments: number };
};

/**
 * SR 업데이트 시 반환 타입
 */
export type SRUpdateResult = SR & {
  client?: { id: string; code: string; name: string };
  requester?: {
    id: string;
    name: string;
    email: string;
    notificationPreference?: import('@prisma/client').NotificationPreference | null;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
    notificationPreference?: import('@prisma/client').NotificationPreference | null;
  } | null;
  serviceCategory?: {
    id: string;
    categoryName: string;
    slaHours: number;
    handlerId?: string | null;
    handler?: { id: string; name: string } | null;
  };
};

/**
 * SR 목록 조회 시 항목 타입
 */
export type SRListItem = Pick<
  SR,
  | 'id'
  | 'srNumber'
  | 'title'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'createdAt'
  | 'completedAt'
  | 'clientId'
  | 'requesterId'
  | 'assigneeId'
  | 'serviceCategoryId'
> & {
  client: { id: string; name: string };
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
  serviceCategory: {
    id: string;
    categoryName: string;
    priority: string;
    slaHours: number;
    handlerId: string | null;
    handler?: { id: string; name: string } | null;
  };
  _count: { comments: number; attachments: number };
};

/**
 * 첨부파일 목록 항목 (클라이언트 뷰).
 *
 * `createdAt` 은 `Date | string` 이다. RSC 로 내려오면 Date, `/api/srs/[id]/attachments`
 * 를 fetch 하면 JSON 직렬화된 string 이라 두 경로가 실제로 서로 다른 값을 싣는다.
 * 소비자는 전부 `new Date(createdAt)` 으로 감싸므로 두 형태 모두 안전하다.
 */
export interface SRAttachmentView {
  id: string;
  fileName: string;
  fileSize: number | bigint;
  fileType: string;
  fileUrl: string;
  createdAt: Date | string;
}
