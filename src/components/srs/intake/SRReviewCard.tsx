/**
 * SR 정보 검토 카드 컴포넌트
 */

import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { priorityLabels, priorityColors } from "./constants";
import type { SRDetail } from "./types";

interface SRReviewCardProps {
  sr: SRDetail;
}

export function SRReviewCard({ sr }: SRReviewCardProps) {
  return (
    <div className="sr-card-template bg-white">
      {/* 카드 헤더 */}
      <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[hsl(var(--sr-primary-dark))] text-white font-bold text-sm">
            1
          </div>
          <div>
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">SR 정보 검토</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              요청자가 등록한 SR 내용을 검토하세요
            </p>
          </div>
        </div>
      </div>

      {/* 카드 내용 */}
      <div className="px-6 py-5 space-y-4">
        {/* SR 번호 및 상태 */}
        <div className="flex items-center gap-4">
          <div>
            <p className="text-sm text-muted-foreground">SR 번호</p>
            <p className="text-2xl font-bold">{sr.srNumber}</p>
          </div>
          <Separator orientation="vertical" className="h-12" />
          <div>
            <p className="text-sm text-muted-foreground">요청 우선순위</p>
            <Badge variant={priorityColors[sr.requestedPriority]}>
              {priorityLabels[sr.requestedPriority]}
            </Badge>
          </div>
          {sr.requestedCompletionDate && (
            <>
              <Separator orientation="vertical" className="h-12" />
              <div>
                <p className="text-sm text-muted-foreground">희망 완료일</p>
                <p className="font-medium">
                  {format(new Date(sr.requestedCompletionDate), "PPP", { locale: ko })}
                </p>
              </div>
            </>
          )}
        </div>

        <Separator />

        {/* 제목 및 설명 */}
        <div>
          <p className="text-sm font-medium text-muted-foreground">제목</p>
          <p className="text-lg font-semibold">{sr.title}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground">상세 내용</p>
          <p className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-md">
            {sr.description}
          </p>
        </div>

        <Separator />

        {/* 고객사 및 요청자 정보 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">고객사</p>
            <p className="font-medium">{sr.client.name}</p>
            <p className="text-xs text-muted-foreground">{sr.client.code}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">서비스 카테고리</p>
            <p className="font-medium">{sr.serviceCategory.categoryName}</p>
            <p className="text-xs text-muted-foreground">
              SLA: {sr.serviceCategory.slaHours}시간
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">요청자</p>
            <p className="font-medium">{sr.requester.name}</p>
            <p className="text-xs text-muted-foreground">{sr.requester.email}</p>
          </div>
        </div>

        {/* 첨부파일 */}
        {sr.attachments.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                첨부파일 ({sr.attachments.length}개)
              </p>
              <div className="space-y-2">
                {sr.attachments.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-2 bg-muted rounded"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{file.fileName}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.fileSize / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <a
                      href={file.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      다운로드
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


