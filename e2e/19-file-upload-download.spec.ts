import { type Browser, expect, type Page, test } from '@playwright/test';
import fs from 'fs';

import { deleteSeededSRs, type SeededSR, seedSR, type SeedSROptions } from './fixtures/sr';
import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';

/**
 * 첨부파일 계약 검증 — 업로드 → 목록 → 다운로드(내용) → 삭제, 그리고 업로드 제한.
 *
 * ── 이 파일의 내력 ───────────────────────────────────────────────────────
 * 예전의 이 스펙은 첨부 섹션·다운로드 링크·삭제 버튼·용량 초과 에러·확장자 차단 에러를
 * 전부 `if (await x.isVisible()) {...} else { console.log('⚠️ 찾을 수 없습니다') }` 로
 * 감쌌다. 즉 **첨부 기능이 통째로 사라져도 7개 테스트가 모두 초록불**이었다.
 * 준비 단계(SR 등록 다이얼로그 + 접수 폼)도 UI 로 통과해 한 번에 40초 넘게 썼는데,
 * 그 전부가 검증 대상이 아닌 arrange 였다.
 *
 * ── 무엇을 계약으로 삼는가 ────────────────────────────────────────────────
 * 용량·확장자 제한이 "어디서" 강제되는지가 이 파일의 핵심이다. 앱에는 세 겹이 있다:
 *   1) SRAttachments(src/components/srs/SRAttachments.tsx) 가 10MB 를 넘으면
 *      **요청을 보내지 않고** 자체 토스트로 막는다. 이건 편의이지 통제가 아니다.
 *   2) upload-guard(assertUploadSizeWithinLimit) 가 Content-Length 로 50MB 를 선검사한다.
 *   3) file-validator(validateFile) 가 위험 확장자 → 내용 기반 MIME → 타입별 크기 순으로
 *      검사한다. text/plain 의 상한은 5MB 이고, .exe 는 확장자만으로 거부된다.
 * 진짜 통제는 2·3(서버)이므로 제한 테스트는 **API 응답 코드**로 단언한다. UI 토스트는
 * "서버 거부가 사용자에게 보이는가"를 확인하는 부수 단언으로만 쓴다 — 토스트만 보면
 * 서버가 조용히 받아 준 경우와 구분이 안 된다.
 *
 * ── 왜 준비를 API 로 하는가 ───────────────────────────────────────────────
 * 등록 UI 는 04-sr-create, 접수 폼은 22-sr-intake-process 가 각각 한 번씩 검증한다.
 * 여기서 필요한 것은 "첨부를 붙일 수 있는 SR" 뿐이므로 `seedSR({ stage: 'INTAKE' })` 로
 * 끝내고, 검증 구간만 UI 로 남긴다. 파일도 디스크에 만들지 않고 메모리 버퍼로 넘긴다 —
 * 예전에는 11MB 짜리 더미를 저장소에 남겼다.
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 를 계속
 * 열어 둔다. "500ms 동안 요청 0건" 은 영원히 성립하지 않는다.
 */

/** 첨부 목록/상세 응답에서 이 스펙이 쓰는 필드. storagePath 는 응답에 없어야 한다. */
interface AttachmentRow {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
}

/** Playwright multipart/파일 선택기에 넘길 파일 표현. */
interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** text/plain 의 서버 상한. src/lib/file-validator.ts 의 ALLOWED_FILE_TYPES 와 같아야 한다. */
const TEXT_MAX_BYTES = 5 * 1024 * 1024;

/** SRAttachments 가 요청 전에 자체로 막는 상한(컴포넌트 하드코딩 값). */
const CLIENT_GUARD_BYTES = 10 * 1024 * 1024;

/** 배치 업로드 1회의 파일 개수 상한. src/lib/file-validator.ts MAX_UPLOAD_FILE_COUNT. */
const MAX_FILE_COUNT = 10;

/** 1x1 투명 PNG. "내용은 PNG 인데 확장자는 .txt" 스푸핑을 만들 때 쓴다. */
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function textFile(name: string, content: string): UploadFile {
  return { name, mimeType: 'text/plain', buffer: Buffer.from(content, 'utf8') };
}

/** 이 SR 자신의 경로인지. `/api/srs/{id}/attachments` 같은 하위 경로와 구분해야 한다. */
const isPath = (url: string, pathname: string) => new URL(url).pathname === pathname;

/**
 * 이 파일이 만든 SR. 공유 DB 라 정리는 선택이 아니다.
 * (SRAttachment 는 SR 에 onDelete: Cascade 이므로 SR 만 지우면 행은 함께 사라진다.)
 */
const seededSRIds: string[] = [];

async function seed(browser: Browser, options: SeedSROptions): Promise<SeededSR> {
  const sr = await seedSR(browser, options);
  seededSRIds.push(sr.id);
  return sr;
}

test.afterAll(async ({ browser }) => {
  await deleteSeededSRs(browser, seededSRIds);
});

/** 서버에 실제로 저장된 첨부 목록. 화면만 보면 낙관적 렌더에 속을 수 있다. */
async function listAttachments(page: Page, srId: string): Promise<AttachmentRow[]> {
  const response = await page.request.get(`/api/srs/${srId}/attachments`);
  expect(response.status(), `GET /api/srs/${srId}/attachments 가 실패했습니다.`).toBe(200);
  return (await response.json()) as AttachmentRow[];
}

/** 단일 업로드 API. 준비 단계에서 쓴다(업로드 UI 자체는 첫 테스트가 검증한다). */
async function uploadViaApi(page: Page, srId: string, file: UploadFile) {
  return page.request.post('/api/attachments', {
    multipart: { file, srId },
  });
}

/**
 * 상세 화면을 열고 첨부파일 탭까지 이동한다.
 *
 * 탭 콘텐츠는 선택될 때 마운트되므로(Radix Tabs 기본 동작) 목록 GET 은 탭 클릭 이후에
 * 발생한다. 그 응답을 기다려야 이후의 "행이 있다/없다" 단언이 로딩 중 상태를 보지 않는다.
 */
async function openAttachmentsTab(page: Page, sr: SeededSR): Promise<void> {
  await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
  // 엉뚱한 SR 을 보고 있지 않은지부터 확정한다.
  await expect(page.getByTestId('sr-title')).toHaveText(sr.title);

  const listLoaded = page.waitForResponse(
    (r) => isPath(r.url(), `/api/srs/${sr.id}/attachments`) && r.request().method() === 'GET'
  );
  await page.getByRole('tab', { name: /첨부파일/ }).click();
  expect((await listLoaded).status(), '첨부 목록 조회가 200 이 아닙니다.').toBe(200);

  // 카드가 로딩 상태를 벗어난 증거. 이 버튼은 로딩 중에는 렌더되지 않는다.
  await expect(page.getByRole('button', { name: '파일 업로드' })).toBeVisible();
}

/**
 * 토스트 본문을 겨냥한다.
 *
 * Radix Toast 는 화면에 보이는 설명 div 말고도, 낭독기용 announce span
 * (`<span role="status">Notification 오류{설명}</span>`)을 잠깐 함께 렌더한다.
 * 두 노드가 겹치는 찰나에 `getByText(부분일치)` 를 쓰면 strict mode 위반으로
 * 터진다(파일 단독 실행에서는 타이밍이 어긋나 통과하다가 전체 실행에서만 실패했다).
 * announce span 은 제목+설명이 이어 붙은 문자열이므로 exact 매칭이면 걸리지 않는다.
 */
function toastText(page: Page, message: string) {
  return page.getByText(message, { exact: true });
}

/** 숨은 input 대신 '파일 업로드' 버튼 → filechooser 경로를 쓴다. 버튼 배선까지 함께 검증된다. */
async function chooseFiles(page: Page, files: UploadFile[]): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '파일 업로드' }).click();
  await (await chooser).setFiles(files);
}

// ============================================================================
// 업로드 · 목록 · 다운로드 (신청자 세션)
// ============================================================================

test.describe('첨부파일 업로드·목록·다운로드 (CLIENT)', () => {
  test.use({ storageState: PERSONA_AUTH_FILES.client });

  test('올린 파일이 목록에 뜨고 서버에도 같은 내용으로 저장된다', async ({ browser, page }) => {
    const sr = await seed(browser, { stage: 'INTAKE', title: `첨부 업로드 SR ${Date.now()}` });
    await openAttachmentsTab(page, sr);

    // 시작 상태를 먼저 확정한다 — 원래 있던 파일을 업로드 결과로 착각하지 않기 위해.
    await expect(page.getByText('첨부파일이 없습니다.')).toBeVisible();

    const fileName = `e2e-attachment-${Date.now()}.txt`;
    const content = `E2E 첨부 검증\n두 번째 줄\n${new Date().toISOString()}\n`;

    const uploaded = page.waitForResponse(
      (r) => isPath(r.url(), '/api/attachments') && r.request().method() === 'POST'
    );
    await chooseFiles(page, [textFile(fileName, content)]);
    expect((await uploaded).status(), 'POST /api/attachments 가 201 이 아닙니다.').toBe(201);

    // ── 화면 반영 ────────────────────────────────────────────────────────
    await expect(page.getByText(fileName)).toBeVisible();
    await expect(page.getByText('1개의 파일')).toBeVisible();
    await expect(page.getByRole('button', { name: `${fileName} 다운로드` })).toBeVisible();
    // 접수(INTAKE)된 SR 의 첨부는 신청자가 지울 수 없다.
    // (srs/[id]/page.tsx 의 canDelete: ADMIN/MANAGER 이거나, 신청자 본인이면서 REQUESTED 일 때만)
    await expect(page.getByRole('button', { name: `${fileName} 삭제` })).toHaveCount(0);

    // ── 서버 상태 ────────────────────────────────────────────────────────
    const rows = await listAttachments(page, sr.id);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.fileName).toBe(fileName);
    // fileType 은 클라이언트가 보낸 값이 아니라 서버가 내용으로 판정한 MIME 이어야 한다.
    expect(row.fileType).toBe('text/plain');
    expect(row.fileSize).toBe(Buffer.byteLength(content, 'utf8'));
    expect(row.fileUrl).toBe(`/api/attachments/${row.id}/download`);
    // 내부 저장 경로는 응답에 실리면 안 된다(라우트가 storagePath 를 떼고 반환한다).
    expect(row).not.toHaveProperty('storagePath');

    // 업로드는 감사 대상이다 — 행만 생기고 활동 로그가 빠지는 회귀를 잡는다.
    const activities = await page.request.get(`/api/srs/${sr.id}/activities`);
    expect(activities.status()).toBe(200);
    const types = ((await activities.json()) as Array<{ type: string; description: string }>).map(
      (a) => a.type
    );
    expect(types).toContain('ATTACHMENT_ADDED');
  });

  test('다운로드한 바이트가 업로드한 파일과 정확히 같다', async ({ browser, page }) => {
    const sr = await seed(browser, { stage: 'INTAKE', title: `첨부 다운로드 SR ${Date.now()}` });

    // 준비는 API 로. 업로드 UI 는 위 테스트가 이미 검증한다.
    const fileName = `e2e-download-${Date.now()}.txt`;
    const buffer = Buffer.from(`다운로드 왕복 검증\n${'x'.repeat(1024)}\n끝\n`, 'utf8');
    const created = await uploadViaApi(page, sr.id, {
      name: fileName,
      mimeType: 'text/plain',
      buffer,
    });
    expect(created.status(), '준비 업로드가 201 이 아닙니다.').toBe(201);
    const attachment = (await created.json()) as AttachmentRow;

    await openAttachmentsTab(page, sr);

    // ── UI 다운로드 버튼 → 실제 파일 ──────────────────────────────────────
    const downloadStarted = page.waitForEvent('download');
    await page.getByRole('button', { name: `${fileName} 다운로드` }).click();
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toBe(fileName);
    const savedPath = await download.path();
    expect(fs.readFileSync(savedPath)).toEqual(buffer);

    // ── 라우트가 직접 내려주는 헤더 계약 ──────────────────────────────────
    // UI 는 blob 으로 감싸므로 여기서만 확인할 수 있다. text/plain 은 inline 금지
    // 대상이라 attachment 여야 한다(저장형 XSS 방지, download/route.ts 의 isInlineSafe).
    const direct = await page.request.get(attachment.fileUrl);
    expect(direct.status()).toBe(200);
    const headers = direct.headers();
    expect(headers['content-disposition']).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cache-control']).toBe('private, no-store');
    expect(await direct.body()).toEqual(buffer);
  });
});

// ============================================================================
// 삭제 (ADMIN 세션 — canDelete 가 열리는 유일한 축 중 하나)
// ============================================================================

test.describe('첨부파일 삭제 (ADMIN)', () => {
  // 주의: legacyManager 는 이름과 달리 admin@example.com(ADMIN) 세션이다.
  test.use({ storageState: PERSONA_AUTH_FILES.legacyManager });

  test('삭제하면 목록에서 사라지고 다운로드 경로도 404 가 된다', async ({ browser, page }) => {
    const sr = await seed(browser, { stage: 'INTAKE', title: `첨부 삭제 SR ${Date.now()}` });

    const fileName = `e2e-delete-${Date.now()}.txt`;
    const created = await uploadViaApi(page, sr.id, textFile(fileName, '삭제 대상 파일입니다.\n'));
    expect(created.status(), '준비 업로드가 201 이 아닙니다.').toBe(201);
    const attachment = (await created.json()) as AttachmentRow;

    await openAttachmentsTab(page, sr);
    await expect(page.getByText(fileName)).toBeVisible();

    await page.getByRole('button', { name: `${fileName} 삭제` }).click();

    // 확인 다이얼로그를 거치지 않고 지워지면 그 자체가 회귀다.
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('파일 삭제 확인')).toBeVisible();

    const deleted = page.waitForResponse(
      (r) =>
        isPath(r.url(), `/api/attachments/${attachment.id}`) && r.request().method() === 'DELETE'
    );
    await dialog.getByRole('button', { name: '삭제' }).click();
    expect((await deleted).status(), 'DELETE /api/attachments/{id} 가 200 이 아닙니다.').toBe(200);

    await expect(page.getByText('첨부파일이 없습니다.')).toBeVisible();
    expect(await listAttachments(page, sr.id)).toHaveLength(0);

    // 행만 지우고 다운로드 라우트가 살아 있으면 인증된 사용자에게 파일이 계속 노출된다.
    const afterDelete = await page.request.get(attachment.fileUrl);
    expect(afterDelete.status(), '삭제된 첨부의 다운로드가 404 가 아닙니다.').toBe(404);

    const activities = await page.request.get(`/api/srs/${sr.id}/activities`);
    expect(activities.status()).toBe(200);
    const types = ((await activities.json()) as Array<{ type: string }>).map((a) => a.type);
    expect(types).toContain('ATTACHMENT_REMOVED');
  });
});

// ============================================================================
// 업로드 제한 — 진짜 통제는 서버다
// ============================================================================

test.describe('업로드 제한 (CLIENT)', () => {
  test.use({ storageState: PERSONA_AUTH_FILES.client });

  /**
   * 이 describe 의 테스트는 **아무것도 저장하지 못하는 것**이 기대 결과다.
   * 그래서 SR 하나를 공유해도 서로의 상태를 건드리지 않는다(각 테스트가 마지막에
   * 첨부 0건임을 확인하므로, 어느 하나가 실수로 저장에 성공하면 그 테스트가 실패한다).
   */
  let sr: SeededSR;

  test.beforeAll(async ({ browser }) => {
    sr = await seed(browser, { stage: 'INTAKE', title: `첨부 제한 SR ${Date.now()}` });
  });

  test('10MB 초과 파일은 요청을 보내기 전에 화면이 막는다', async ({ page }) => {
    await openAttachmentsTab(page, sr);

    // 요청이 실제로 나갔는지 세어 둔다. 토스트만 보면 "서버가 받아 준 뒤 실패한" 경우와
    // 구분되지 않는다 — 이 가드의 값은 업로드를 아예 시작하지 않는 데 있다.
    let uploadRequests = 0;
    page.on('request', (request) => {
      if (isPath(request.url(), '/api/attachments') && request.method() === 'POST') {
        uploadRequests += 1;
      }
    });

    await chooseFiles(page, [
      {
        name: `e2e-oversize-${Date.now()}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.alloc(CLIENT_GUARD_BYTES + 1, 'a'),
      },
    ]);

    await expect(toastText(page, '파일 크기는 10MB를 초과할 수 없습니다.')).toBeVisible();
    expect(uploadRequests, '클라이언트 가드가 막았다면 업로드 요청이 없어야 한다.').toBe(0);
    expect(await listAttachments(page, sr.id)).toHaveLength(0);
  });

  test('text/plain 5MB 상한은 서버가 400 으로 강제하고 화면이 그 사유를 보여준다', async ({
    page,
  }) => {
    await openAttachmentsTab(page, sr);

    // 5MB 초과 · 10MB 미만 — 화면 가드는 통과하고 서버 검증에만 걸리는 구간이다.
    const oversized = Buffer.alloc(TEXT_MAX_BYTES + 1, 'a');
    const rejected = page.waitForResponse(
      (r) => isPath(r.url(), '/api/attachments') && r.request().method() === 'POST'
    );
    await chooseFiles(page, [
      { name: `e2e-too-big-${Date.now()}.txt`, mimeType: 'text/plain', buffer: oversized },
    ]);

    const response = await rejected;
    expect(response.status(), '5MB 를 넘는 텍스트 업로드가 400 이 아닙니다.').toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe('BAD_REQUEST');

    // 서버가 준 사유가 사용자에게 그대로 보이는지 (조용한 실패 금지).
    await expect(
      toastText(page, '파일 크기가 너무 큽니다. 최대 5 MB까지 업로드 가능합니다.')
    ).toBeVisible();
    expect(await listAttachments(page, sr.id)).toHaveLength(0);
  });

  test('위험 확장자(.exe)는 서버가 400 으로 막는다', async ({ page }) => {
    // 서버 단언이 먼저다 — 이것이 실제 통제다.
    const response = await uploadViaApi(page, sr.id, {
      name: 'e2e-malware.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ\x90\x00\x03', 'binary'),
    });
    expect(response.status(), '.exe 업로드가 400 이 아닙니다.').toBe(400);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.error).toBe('보안상의 이유로 .exe 파일은 업로드할 수 없습니다.');
    expect(body.code).toBe('BAD_REQUEST');
    expect(await listAttachments(page, sr.id)).toHaveLength(0);

    // 화면에도 같은 사유가 뜬다. SRAttachments 의 input 에는 accept 가 없어
    // 브라우저가 걸러 주지 않으므로, 이 경로는 반드시 서버 응답을 거쳐 온다.
    await openAttachmentsTab(page, sr);
    const rejected = page.waitForResponse(
      (r) => isPath(r.url(), '/api/attachments') && r.request().method() === 'POST'
    );
    await chooseFiles(page, [
      {
        name: 'e2e-malware.exe',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('MZ\x90\x00\x03', 'binary'),
      },
    ]);
    expect((await rejected).status()).toBe(400);
    await expect(
      toastText(page, '보안상의 이유로 .exe 파일은 업로드할 수 없습니다.')
    ).toBeVisible();
  });

  test('확장자와 실제 내용이 다른 파일은 서버가 400 으로 막는다', async ({ page }) => {
    // 내용은 PNG 인데 이름은 .txt — 확장자 스푸핑. magic-byte 검사가 이것을 잡아야 한다.
    const spoofed = await uploadViaApi(page, sr.id, {
      name: 'e2e-spoofed.txt',
      mimeType: 'text/plain',
      buffer: PNG_BYTES,
    });
    expect(spoofed.status(), '확장자 스푸핑 업로드가 400 이 아닙니다.').toBe(400);
    expect(((await spoofed.json()) as { error: string }).error).toBe(
      '파일 확장자(.txt)와 실제 파일 형식(image/png)이 일치하지 않습니다.'
    );

    // 반대 방향: 타입을 식별할 수 없는 내용에 이미지 확장자를 붙인 경우.
    const unknown = await uploadViaApi(page, sr.id, {
      name: 'e2e-unknown.png',
      mimeType: 'image/png',
      buffer: Buffer.from('이건 그냥 텍스트입니다.\n', 'utf8'),
    });
    expect(unknown.status()).toBe(400);
    expect(((await unknown.json()) as { error: string }).error).toBe(
      '파일 형식을 인식할 수 없습니다.'
    );

    expect(await listAttachments(page, sr.id)).toHaveLength(0);
  });

  test('종결된 SR 에는 첨부를 붙일 수 없다', async ({ browser, page }) => {
    // 완료·확정·반려는 감사 대상이라 첨부가 잠긴다(policies.ts 의 CLOSED_SR_STATUSES).
    const closed = await seed(browser, {
      stage: 'COMPLETED',
      title: `첨부 잠금 SR ${Date.now()}`,
    });

    const response = await uploadViaApi(page, closed.id, textFile('e2e-late.txt', '늦은 첨부\n'));
    expect(response.status(), '종결된 SR 에 대한 업로드가 403 이 아닙니다.').toBe(403);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.error).toContain('종결된 SR');
    expect(body.code).toBe('FORBIDDEN');
    expect(await listAttachments(page, closed.id)).toHaveLength(0);
  });
});

// ============================================================================
// 배치(다중 파일) 업로드 — /api/srs/[id]/attachments
// ============================================================================

test.describe('다중 파일 업로드 (CLIENT)', () => {
  test.use({ storageState: PERSONA_AUTH_FILES.client });

  /**
   * 다중 업로드는 상세 화면의 첨부 카드가 아니라 **배치 라우트**의 계약이다.
   * SRAttachments 의 input 에는 multiple 이 없고 handleFileUpload 도 files[0] 만 쓴다.
   * 여러 파일을 한 번에 보내는 경로는 SR 등록 다이얼로그(useCreateSRForm.uploadAttachments)
   * 뿐이고, 그 UI 는 04-sr-create 가 검증한다. 그래서 여기서는 API 로 계약을 고정하고
   * 결과가 상세 화면 목록에 그대로 나타나는지까지 확인한다.
   */
  async function uploadBatch(page: Page, srId: string, files: UploadFile[]) {
    const form = new FormData();
    for (const file of files) {
      form.append(
        'files',
        new File([new Uint8Array(file.buffer)], file.name, {
          type: file.mimeType,
        })
      );
    }
    return page.request.post(`/api/srs/${srId}/attachments`, { multipart: form });
  }

  test('두 파일을 한 번에 올리면 둘 다 저장되고 목록에 함께 나타난다', async ({
    browser,
    page,
  }) => {
    const sr = await seed(browser, { stage: 'INTAKE', title: `배치 업로드 SR ${Date.now()}` });

    const stamp = Date.now();
    const first = textFile(`e2e-batch-1-${stamp}.txt`, '배치 파일 1\n');
    // 한글 파일명 왕복도 함께 본다 — 저장 경로는 정화되지만 표시 이름은 원본이어야 한다.
    // 내용 길이를 일부러 다르게 둔다: 두 파일의 크기가 같으면 아래 크기 단언이 통과해도
    // 어느 파일의 크기인지 구분하지 못한다.
    const second = textFile(`e2e-배치-2-${stamp}.txt`, '배치 파일 2 — 첫 번째보다 긴 내용\n');

    const response = await uploadBatch(page, sr.id, [first, second]);
    expect(response.status(), '배치 업로드가 201 이 아닙니다.').toBe(201);
    const body = (await response.json()) as {
      message: string;
      data: { attachments: AttachmentRow[]; errors?: unknown[] };
    };
    expect(body.message).toBe('2개의 파일이 업로드되었습니다.');
    expect(body.data.attachments).toHaveLength(2);
    expect(body.data.errors).toBeUndefined();

    const rows = await listAttachments(page, sr.id);
    const byName = new Map(rows.map((r) => [r.fileName, r]));
    expect([...byName.keys()].sort()).toEqual([first.name, second.name].sort());
    expect(byName.get(first.name)!.fileSize).toBe(first.buffer.length);
    expect(byName.get(second.name)!.fileSize).toBe(second.buffer.length);

    await openAttachmentsTab(page, sr);
    await expect(page.getByText('2개의 파일')).toBeVisible();
    await expect(page.getByRole('button', { name: `${first.name} 다운로드` })).toBeVisible();
    await expect(page.getByRole('button', { name: `${second.name} 다운로드` })).toBeVisible();
  });

  test('검증에 실패한 파일만 걸러 내고, 개수 상한은 요청 전체를 막는다', async ({
    browser,
    page,
  }) => {
    const sr = await seed(browser, { stage: 'INTAKE', title: `배치 부분실패 SR ${Date.now()}` });
    const stamp = Date.now();

    // ── 유효 1 + 위험 확장자 1: 유효한 것만 저장되고 실패는 보고된다 ──────
    const good = textFile(`e2e-mixed-ok-${stamp}.txt`, '통과해야 하는 파일\n');
    const bad: UploadFile = {
      name: `e2e-mixed-bad-${stamp}.exe`,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ\x90\x00\x03', 'binary'),
    };

    const mixed = await uploadBatch(page, sr.id, [good, bad]);
    expect(mixed.status(), '부분 성공 배치가 201 이 아닙니다.').toBe(201);
    const mixedBody = (await mixed.json()) as {
      message: string;
      data: { attachments: AttachmentRow[]; errors?: Array<{ fileName: string; error: string }> };
    };
    expect(mixedBody.data.attachments).toHaveLength(1);
    expect(mixedBody.data.attachments[0]!.fileName).toBe(good.name);
    expect(mixedBody.data.errors).toHaveLength(1);
    expect(mixedBody.data.errors![0]!.fileName).toBe(bad.name);
    expect(mixedBody.data.errors![0]!.error).toBe(
      '보안상의 이유로 .exe 파일은 업로드할 수 없습니다.'
    );

    const afterMixed = await listAttachments(page, sr.id);
    expect(afterMixed.map((r) => r.fileName)).toEqual([good.name]);

    // ── 개수 상한 초과: 한 건도 저장되지 않아야 한다 ──────────────────────
    const tooMany = Array.from({ length: MAX_FILE_COUNT + 1 }, (_, i) =>
      textFile(`e2e-many-${stamp}-${i}.txt`, `개수 상한 검증 ${i}\n`)
    );
    const overCount = await uploadBatch(page, sr.id, tooMany);
    expect(overCount.status(), `${MAX_FILE_COUNT + 1}개 업로드가 400 이 아닙니다.`).toBe(400);
    expect(((await overCount.json()) as { error: string }).error).toBe(
      `한 번에 최대 ${MAX_FILE_COUNT}개의 파일만 업로드할 수 있습니다.`
    );

    // 상한 초과 요청은 부분 저장도 남기지 않는다 — 앞선 1건 그대로여야 한다.
    const afterOverCount = await listAttachments(page, sr.id);
    expect(afterOverCount.map((r) => r.fileName)).toEqual([good.name]);
  });
});

// ============================================================================
// 미구현 기능
// ============================================================================

/**
 * 댓글 첨부는 앱에 존재하지 않는다.
 *  - src/components/srs/SRComments.tsx 에 파일 입력이 없다(Textarea 하나뿐).
 *  - prisma/schema.prisma 의 SRAttachment 는 srId 만 가진다 — 댓글에 파일을 매달 컬럼이 없다.
 * 예전 스펙은 "댓글 파일 업로드 필드를 찾을 수 없습니다" 를 로그로 남기고 통과했다.
 */
test.fixme('댓글에 파일을 첨부한다', async () => {
  // 구현되면: 댓글 작성 폼에서 파일 선택 → 댓글 저장 → 댓글 항목 안에 첨부가 표시되는지.
});
