import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

import { createTestSR, deleteSRViaAPI, findSRInList } from './helpers/test-helpers';

/**
 * SR 생성 플로우 — 등록 다이얼로그의 계약.
 *
 * ── 첨부 경로를 여기서 검증하는 이유 ─────────────────────────────────────
 * 19번 스펙은 **상세 화면의** 첨부 탭(POST /api/attachments, 단일 업로드)을 다룬다.
 * 등록 다이얼로그는 완전히 다른 경로다 — src/hooks/use-create-sr-form.ts 의
 * `uploadAttachments` 가 SR 생성 직후 POST /api/srs/{id}/attachments(배치)를 부른다.
 * 이 경로는 그동안 E2E 가 한 줄도 없었다.
 *
 * 배치 엔드포인트는 **부분 성공을 201 로** 돌려준다: 검증에 걸린 파일은
 * `data.errors[]` 에 담기고 나머지만 저장된다(전부 실패일 때만 400). 그래서
 * `response.ok` 만 보면 3개 중 1개만 저장돼도 성공으로 읽힌다. 아래 두 번째
 * 테스트가 그 지점을 고정한다.
 *
 * ⚠️ networkidle 금지 — 로그인 상태에서는 /api/realtime SSE 가 계속 열려 있어
 * "500ms 동안 요청 0건" 이 영원히 성립하지 않는다.
 */

/** 배치 업로드 응답에서 이 스펙이 쓰는 형태. */
interface BatchUploadBody {
  message: string;
  data: {
    attachments: Array<{ id: string; fileName: string }>;
    errors?: Array<{ fileName: string; error: string }>;
  };
}

/** 첨부 목록 응답. storagePath 는 응답에 없어야 한다. */
interface AttachmentRow {
  id: string;
  fileName: string;
}

/**
 * 토스트 영역으로 스코프한다.
 *
 * Radix Toast 는 화면에 보이는 설명 div 외에 낭독기용 announce 노드
 * (`<span role="status">Notification{제목}{설명}</span>`)를 **토스트 영역 밖에**
 * 잠깐 함께 렌더한다. 페이지 전역에서 getByText 를 쓰면 두 노드가 겹치는 찰나에
 * strict mode 위반으로 터진다(단독 실행에서는 타이밍이 어긋나 통과하기도 한다).
 */
function toast(page: Page) {
  return page.getByLabel(/Notifications/);
}

function textFile(name: string, content: string) {
  return { name, mimeType: 'text/plain', buffer: Buffer.from(content, 'utf8') };
}

/**
 * 테스트가 만든 고객사를 지운다.
 *
 * `DELETE /api/clients/{id}` 만으로는 **절대 지워지지 않는다.** 고객사를 만들면
 * 서비스가 기본 서비스 카테고리를 함께 만드는데, 삭제는 참조가 하나라도 있으면
 * 409(ReferentialIntegrityError)로 막히기 때문이다. 그래서 카테고리를 먼저 지운다.
 *
 * 정리를 빠뜨리면 공유 DB 에 빈 고객사가 쌓이고, 그것만으로 다른 스펙이 깨진다 —
 * 24번(조직도 드래그)은 고객사 카드를 하나씩 펼쳐 보며 드래그 가능한 사용자를 찾으므로,
 * 사용자 0명짜리 고객사가 늘어날수록 그만큼 느려지다 결국 타임아웃한다. 실제로 그랬다.
 */
async function deleteClientDeep(api: APIRequestContext, clientId: string): Promise<void> {
  const categories = await api.get(`/api/clients/${clientId}/categories`);
  if (categories.ok()) {
    const rows = (await categories.json()) as Array<{ id: string }>;
    for (const row of rows) {
      const removedCategory = await api.delete(`/api/clients/${clientId}/categories/${row.id}`);
      expect(
        removedCategory.ok(),
        `테스트 고객사 ${clientId}의 카테고리 ${row.id}를 정리하지 못했습니다: ${await removedCategory.text()}`
      ).toBe(true);
    }
  }
  const removed = await api.delete(`/api/clients/${clientId}`);
  expect(
    removed.ok(),
    `테스트 고객사 ${clientId} 를 정리하지 못했습니다: ${await removed.text()}`
  ).toBe(true);
}

/**
 * 등록 다이얼로그를 열고 필수 항목만 채운다. 제출은 하지 않는다.
 *
 * 콤보박스 선택 후 `waitForTimeout` 을 쓰지 않는다 — Radix Select 는 옵션이 붙은
 * 뒤에야 role=option 이 잡히므로, 옵션 로케이터를 기다리는 것 자체가 동기화다.
 */
async function openCreateDialogWithRequiredFields(page: Page, title: string): Promise<void> {
  // React 수화 전에 클릭하면 버튼은 보이지만 이벤트 핸들러가 아직 붙지 않아 클릭이
  // 유실될 수 있다. load 완료와 버튼 활성 상태를 양성 조건으로 잡은 뒤 조작한다.
  await page.goto('/srs', { waitUntil: 'load' });
  const createButton = page.getByRole('button', { name: /등록/ }).first();
  await expect(createButton).toBeEnabled();
  await createButton.click();
  await expect(page.getByRole('heading', { name: /새 SR 요청/ })).toBeVisible();

  await page.getByRole('textbox', { name: '제목 *' }).fill(title);
  await page
    .getByRole('textbox', { name: '설명 *' })
    .fill('첨부 경로 검증용 SR 입니다. 설명 최소 길이를 넘기기 위한 문장입니다.');

  // 고객사는 CLIENT 세션에서 자동 선택되어 비활성일 수 있다.
  const clientCombobox = page.getByRole('combobox', { name: '고객사 *' });
  if (await clientCombobox.isEnabled()) {
    await clientCombobox.click();
    await page.getByRole('option').first().click();
  }

  const categoryCombobox = page.getByRole('combobox', { name: '서비스 카테고리 *' });
  await categoryCombobox.click();
  await page.getByRole('option').first().click();
}

test.describe('SR 생성', () => {
  const createdSRIds: string[] = [];

  test.afterAll(async ({ browser }) => {
    if (createdSRIds.length === 0) return;
    const context = await browser.newContext({ storageState: './playwright/.auth/user.json' });
    for (const id of createdSRIds) {
      await deleteSRViaAPI(context.request, id);
    }
    await context.close();
  });

  test('SR 생성 다이얼로그 열기', async ({ page }) => {
    await page.goto('/srs');

    // 등록 버튼 클릭
    await page.click('button:has-text("등록")');

    // 다이얼로그 제목 확인
    await expect(page.getByRole('heading', { name: /새 SR 요청/ })).toBeVisible();
  });

  test('SR 생성 플로우 - 전체 (헬퍼 사용)', async ({ page }) => {
    const timestamp = Date.now();
    const srTitle = `E2E 테스트 SR ${timestamp}`;

    // 헬퍼 함수로 SR 생성
    const srId = await createTestSR(page, {
      title: srTitle,
      description: '이것은 Playwright를 사용한 E2E 테스트 SR입니다.',
    });

    expect(srId).toBeDefined();
    if (srId) createdSRIds.push(srId);

    // SR이 목록에 있는지 확인
    await page.goto('/srs');
    const srRow = await findSRInList(page, srTitle);
    await expect(srRow).toBeVisible();
  });

  test('SR 생성 유효성 검증', async ({ page }) => {
    await page.goto('/srs');

    // 등록 버튼 클릭
    await page.click('button:has-text("등록")');

    // 빈 폼으로 제출 시도
    await page.click('button[type="submit"]:has-text("저장")');

    // 유효성 검증 메시지 확인
    await expect(page.locator('text=필수')).toBeVisible();
  });

  // ==========================================================================
  // 첨부 경로 — 등록 다이얼로그 → 배치 업로드
  // ==========================================================================

  test('등록 시 붙인 파일이 실제로 저장되고 상세에서 조회된다', async ({ page }) => {
    const title = `첨부 동반 등록 SR ${Date.now()}`;
    await openCreateDialogWithRequiredFields(page, title);

    const fileName = `e2e-create-${Date.now()}.txt`;
    await page
      .locator('input[type="file"]')
      .setInputFiles([textFile(fileName, '등록과 함께 올린 파일입니다.\n')]);

    // 폼 상태에 반영됐는지 먼저 확인한다 — 여기서 어긋나면 제출 결과를 해석할 수 없다.
    await expect(page.getByText('선택된 파일 (1/5)')).toBeVisible();

    const uploadResponse = page.waitForResponse((r) =>
      /\/api\/srs\/[^/]+\/attachments$/.test(new URL(r.url()).pathname)
    );
    await page.getByRole('button', { name: '저장' }).click();

    const upload = await uploadResponse;
    expect(upload.status(), '배치 업로드가 201 이 아닙니다.').toBe(201);
    const body = (await upload.json()) as BatchUploadBody;
    expect(body.data.attachments).toHaveLength(1);
    expect(body.data.errors, '거부된 파일이 없어야 합니다.').toBeUndefined();

    // 사용자에게 보이는 숫자도 저장된 개수여야 한다.
    await expect(toast(page).getByText('SR이 생성되었습니다. (첨부파일 1개 업로드)')).toBeVisible();

    // 서버 상태로 확정한다. 응답만 보면 낙관적 렌더에 속을 수 있다.
    const srId = new URL(upload.url()).pathname.split('/')[3]!;
    createdSRIds.push(srId);
    const listed = await page.request.get(`/api/srs/${srId}/attachments`);
    expect(listed.status()).toBe(200);
    const rows = (await listed.json()) as AttachmentRow[];
    expect(rows.map((r) => r.fileName)).toEqual([fileName]);
  });

  test('검증에 걸린 파일이 섞이면 성공으로 오보고하지 않는다', async ({ page }) => {
    const title = `첨부 부분 실패 SR ${Date.now()}`;
    await openCreateDialogWithRequiredFields(page, title);

    // .exe 는 file-validator 가 확장자만으로 거부한다. FileUpload 는 accept='*/*' 라
    // 클라이언트에서 걸러 내지 않으므로 서버까지 도달한다.
    const goodName = `e2e-good-${Date.now()}.txt`;
    const badName = `e2e-bad-${Date.now()}.exe`;
    await page
      .locator('input[type="file"]')
      .setInputFiles([
        textFile(goodName, '통과해야 하는 파일입니다.\n'),
        { name: badName, mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') },
      ]);
    await expect(page.getByText('선택된 파일 (2/5)')).toBeVisible();

    const uploadResponse = page.waitForResponse((r) =>
      /\/api\/srs\/[^/]+\/attachments$/.test(new URL(r.url()).pathname)
    );
    await page.getByRole('button', { name: '저장' }).click();

    // 부분 성공은 201 이다 — 이 코드만 보고 "다 올라갔다" 고 판단하면 안 된다는 게 요지.
    const upload = await uploadResponse;
    expect(upload.status()).toBe(201);
    const body = (await upload.json()) as BatchUploadBody;
    expect(body.data.attachments.map((a) => a.fileName)).toEqual([goodName]);
    expect(body.data.errors?.map((e) => e.fileName)).toEqual([badName]);

    const srId = new URL(upload.url()).pathname.split('/')[3]!;
    createdSRIds.push(srId);

    // ── 여기가 결함이었다 ────────────────────────────────────────────────
    // use-create-sr-form 의 uploadAttachments 는 `response.ok` 만 확인하고 응답 본문을
    // 버렸다. 그래서 호출부가 **고른 파일 수**(2)로 "첨부파일 2개 업로드" 를 띄웠고,
    // 실제로 저장된 건 1개였다. 사용자는 상세를 열어야 그 사실을 알 수 있었다.
    await expect(toast(page).getByText('일부 첨부파일이 업로드되지 않았습니다')).toBeVisible();
    await expect(
      toast(page).getByText(new RegExp(`1개 업로드 / 1개 실패.*${badName}`))
    ).toBeVisible();
    await expect(toast(page).getByText('SR이 생성되었습니다. (첨부파일 2개 업로드)')).toHaveCount(
      0
    );

    // 서버에도 통과한 파일만 있어야 한다.
    const listed = await page.request.get(`/api/srs/${srId}/attachments`);
    const rows = (await listed.json()) as AttachmentRow[];
    expect(rows.map((r) => r.fileName)).toEqual([goodName]);
  });

  test('비활성 고객사는 선택지에 없다', async ({ page }) => {
    // 예전 이 테스트는 콤보박스를 열어 옵션 **개수**를 console.log 로 찍고 끝났다.
    // 비활성 고객사가 그대로 나와도 통과했고, 실제로 그랬다 —
    // client.service.getClientsForSelection 이 isActive 를 아예 보지 않았다.
    //
    // 시드 고객사는 둘 다 활성이라 "현재 상태를 그대로 대조" 하면 아무것도 증명하지
    // 못한다. 이 테스트가 직접 비활성 고객사를 하나 만들어 두고 확인한다.
    const stamp = Date.now();
    const inactiveName = `E2E 비활성 고객사 ${stamp}`;
    const created = await page.request.post('/api/clients', {
      data: {
        code: `E2EOFF${stamp % 100000}`,
        name: inactiveName,
        isActive: false,
      },
    });
    expect(created.status(), `준비용 고객사 생성 실패: ${await created.text()}`).toBe(201);
    const inactiveId = ((await created.json()) as { id: string }).id;

    try {
      // 대조군: 활성 고객사는 선택지에 있어야 한다(전부 사라지는 과잉 필터 방지).
      const activeName = `E2E 활성 고객사 ${stamp}`;
      const activeCreated = await page.request.post('/api/clients', {
        data: { code: `E2EON${stamp % 100000}`, name: activeName, isActive: true },
      });
      expect(activeCreated.status()).toBe(201);
      const activeId = ((await activeCreated.json()) as { id: string }).id;

      try {
        await page.goto('/srs', { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: /등록/ }).first().click();
        await expect(page.getByRole('heading', { name: /새 SR 요청/ })).toBeVisible();

        await page.getByRole('combobox', { name: '고객사 *' }).click();
        // 활성 쪽이 뜨는 것을 먼저 기다린다 — 목록이 아직 안 왔는데 "없다" 를
        // 단언하면 무엇을 확인했는지 알 수 없다.
        await expect(page.getByRole('option', { name: new RegExp(activeName) })).toBeVisible();

        await expect(
          page.getByRole('option', { name: new RegExp(inactiveName) }),
          '비활성 고객사가 SR 등록 선택지에 남아 있습니다.'
        ).toHaveCount(0);
      } finally {
        await deleteClientDeep(page.request, activeId);
      }
    } finally {
      await deleteClientDeep(page.request, inactiveId);
    }
  });
});
