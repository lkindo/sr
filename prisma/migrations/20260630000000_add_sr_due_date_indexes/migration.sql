-- CreateIndex
-- 마감일 기반 큐/대시보드 조회(dueToday, 담당자별 마감 임박) 성능 개선용 인덱스
CREATE INDEX "srs_status_due_date_idx" ON "srs"("status", "due_date");
CREATE INDEX "srs_assignee_id_due_date_idx" ON "srs"("assignee_id", "due_date");
