"use client";

import { use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useIntakeForm } from "@/components/srs/intake/useIntakeForm";
import { SRReviewCard } from "@/components/srs/intake/SRReviewCard";
import { IntakeFormCard } from "@/components/srs/intake/IntakeFormCard";

export default function SRIntakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { sr, users, loading, submitting, isEditMode, form, onSubmit } = useIntakeForm({
    srId: id,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (!sr) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">SR을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--sr-primary-dark))]">
            {isEditMode ? "SR 접수 정보 수정" : "SR 접수 처리"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isEditMode
              ? "접수된 SR의 정보를 수정하세요."
              : "SR을 검토하고 접수 정보를 입력하세요."}
          </p>
        </div>
        <Link href="/srs">
          <Button className="sr-btn-template">
            목록으로 돌아가기
          </Button>
        </Link>
      </div>

      {/* Step 1: SR 정보 검토 */}
      <SRReviewCard sr={sr} />

      {/* Step 2: 접수 정보 입력 */}
      <IntakeFormCard
        form={form}
        onSubmit={onSubmit}
        sr={sr}
        users={users}
        isEditMode={isEditMode}
        submitting={submitting}
      />
    </div>
  );
}
