// src/hooks/useSR.ts
import { useQuery } from "@tanstack/react-query";

export interface SR {
  id: string;
  srNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  requestedCompletionDate?: string;
  dueDate?: string;
  actualCompletionDate?: string;
  client: {
    id: string;
    name: string;
    code: string;
  };
  category?: {
    id: string;
    name: string;
  };
  requester: {
    id: string;
    name: string;
    email: string;
  };
  assignedTo?: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    comments: number;
    attachments: number;
  };
}

export function useSR(srId: string) {
  return useQuery<SR, Error>({
    queryKey: ["sr", srId],
    queryFn: async () => {
      const response = await fetch(`/api/srs/${srId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch SR");
      }
      return response.json();
    },
    enabled: !!srId, // srId가 있을 때만 쿼리 실행
  });
}

export function useSRs() {
  return useQuery<SR[], Error>({
    queryKey: ["srs"],
    queryFn: async () => {
      const response = await fetch("/api/srs");
      if (!response.ok) {
        throw new Error("Failed to fetch SRs");
      }
      return response.json();
    },
  });
}
