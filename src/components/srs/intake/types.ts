/**
 * SR 접수 관련 타입 정의
 */

export interface SRDetail {
  id: string;
  srNumber: string;
  title: string;
  description: string;
  status: string;
  requestedPriority: string;
  requestedCompletionDate?: string | null;
  client: {
    id: string;
    code: string;
    name: string;
  };
  requester: {
    id: string;
    name: string;
    email: string;
  };
  serviceCategory: {
    id: string;
    categoryName: string;
    slaHours: number;
    handlerId?: string | null;
    handler?: {
      id: string;
      name: string;
    } | null;
  };
  attachments: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    fileUrl: string;
    createdAt: string;
  }>;
}

export interface User {
  id: string;
  name: string;
  email: string;
}


