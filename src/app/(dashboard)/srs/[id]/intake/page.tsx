'use client';

import { use } from 'react';
import Link from 'next/link';

import { IntakeFormCard } from '@/components/srs/intake/IntakeFormCard';
import { SRReviewCard } from '@/components/srs/intake/SRReviewCard';
import { Button } from '@/components/ui';
import { useIntakeForm } from '@/hooks/use-intake-form';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * 접수 권한을 가진 역할.
 *
 * 서버(src/app/api/srs/[id]/intake/route.ts)가 요구하는 것과 같은 조건이다 —
 * `SR:INTAKE` 권한 또는 ADMIN/MANAGER/ENGINEER 역할(INTERNAL_ROLES).
 */
const INTAKE_ROLES = ['ADMIN', 'MANAGER', 'ENGINEER'];

export default function SRIntakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { hasAnyRole, hasPermission } = usePermissions();
  const { sr, users, loading, submitting, isEditMode, form, onSubmit } = useIntakeForm({
    srId: id,
  });

  // 이 페이지에는 아무 가드도 없었다. CLIENT_USER 가 URL 로 직접 들어오면 접수 폼 전체가
  // (우선순위·담당자 콤보박스, 저장 버튼까지) 그대로 렌더됐다. 저장은 서버가 403 으로
  // 막으므로 데이터가 새지는 않았지만, 누를 수 있는 척하는 화면을 보여 주는 것 자체가
  // 결함이고 방어가 한 겹뿐이라는 뜻이기도 하다.
  const canIntake = hasAnyRole(INTAKE_ROLES) || hasPermission('SR', 'INTAKE');
  if (!canIntake) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-muted-foreground">SR 접수 처리 권한이 없습니다.</p>
        <Link href={`/srs/${id}`}>
          <Button className="sr-btn-template">SR 상세로 돌아가기</Button>
        </Link>
      </div>
    );
  }

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
            {isEditMode ? 'SR 접수 정보 수정' : 'SR 접수 처리'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isEditMode
              ? '접수된 SR의 정보를 수정하세요.'
              : 'SR을 검토하고 접수 정보를 입력하세요.'}
          </p>
        </div>
        <Link href="/srs">
          <Button className="sr-btn-template">목록으로 돌아가기</Button>
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
