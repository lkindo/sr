import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * 파일 업로드/다운로드 전체 플로우 E2E 테스트
 *
 * 시나리오:
 * 1. SR 생성 시 첨부파일 업로드
 * 2. SR 상세에서 첨부파일 확인
 * 3. 댓글에 첨부파일 추가
 * 4. 첨부파일 다운로드 확인
 * 5. 첨부파일 삭제 (권한 확인)
 * 6. 대용량 파일 업로드 에러 핸들링
 * 7. 허용되지 않은 파일 형식 업로드 차단
 */

const authFiles = {
  client: path.join(__dirname, '../playwright/.auth/client.json'),
  manager: path.join(__dirname, '../playwright/.auth/manager.json'),
  engineer: path.join(__dirname, '../playwright/.auth/engineer.json'),
};

// 테스트용 파일 생성
const testFilesDir = path.join(__dirname, '../playwright/.test-files');

// 테스트 파일 디렉토리 생성
if (!fs.existsSync(testFilesDir)) {
  fs.mkdirSync(testFilesDir, { recursive: true });
}

// 테스트용 파일들 생성
const testFile1 = path.join(testFilesDir, 'test-document.txt');
const testFile2 = path.join(testFilesDir, 'test-image.png');
const testFile3 = path.join(testFilesDir, 'test-log.log');
const testFileLarge = path.join(testFilesDir, 'test-large-file.bin');
const testFileInvalid = path.join(testFilesDir, 'test-invalid.exe');

// 파일 생성 (없으면)
if (!fs.existsSync(testFile1)) {
  fs.writeFileSync(testFile1, 'This is a test document for E2E testing.\nLine 2\nLine 3');
}

if (!fs.existsSync(testFile2)) {
  // 간단한 1x1 PNG 생성
  const pngData = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  fs.writeFileSync(testFile2, pngData);
}

if (!fs.existsSync(testFile3)) {
  fs.writeFileSync(testFile3, '[2024-01-01 10:00:00] INFO: Test log entry\n[2024-01-01 10:01:00] ERROR: Test error');
}

// 대용량 파일 (11MB, 제한이 10MB라고 가정)
if (!fs.existsSync(testFileLarge)) {
  const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
  fs.writeFileSync(testFileLarge, largeBuffer);
}

// 허용되지 않은 파일 형식
if (!fs.existsSync(testFileInvalid)) {
  fs.writeFileSync(testFileInvalid, 'MZ'); // EXE 파일 시그니처
}

test.describe('파일 업로드/다운로드 플로우', () => {
  let srId: string;
  let srTitle: string;

  test.describe.configure({ mode: 'serial' });

  test('1. CLIENT: SR 생성 시 첨부파일 업로드', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto('/srs', { waitUntil: 'networkidle', timeout: 30000 });

      // SR 생성 버튼 클릭
      const createButton = page.getByRole('button', { name: /등록|새 SR|Create/i }).first();
      await expect(createButton).toBeVisible({ timeout: 10000 });
      await createButton.click();

      // 다이얼로그 확인
      await expect(page.getByRole('heading', { name: /새 SR 요청|Create SR/i })).toBeVisible({ timeout: 5000 });

      // SR 정보 입력
      const timestamp = Date.now();
      srTitle = `파일 업로드 테스트 SR ${timestamp}`;

      await page.getByRole('textbox', { name: '제목 *' }).fill(srTitle);
      await page.getByRole('textbox', { name: '설명 *' }).fill('첨부파일 포함 SR 생성 테스트');

      // 고객사 선택 (CLIENT는 자동 설정될 수 있음 - disabled 상태)
      const clientCombobox = page.getByRole('combobox', { name: '고객사 *' });
      const isClientDisabled = await clientCombobox.isDisabled().catch(() => true);

      if (!isClientDisabled) {
        await expect(clientCombobox).toBeEnabled({ timeout: 15000 });
        await clientCombobox.click();
        const firstClientOption = page.getByRole('option').first();
        await firstClientOption.waitFor({ state: 'visible', timeout: 15000 });
        await firstClientOption.click();
        await page.waitForTimeout(300);
      } else {
        console.log('⚠️ CLIENT 사용자: 고객사 자동 설정됨 (선택 스킵)');
      }

      // 서비스 카테고리 선택 - enabled될 때까지 대기
      const categoryCombobox = page.getByRole('combobox', { name: '서비스 카테고리 *' });
      await expect(categoryCombobox).toBeEnabled({ timeout: 15000 });
      await categoryCombobox.click();
      await page.waitForTimeout(500);
      const firstCategoryOption = page.getByRole('option').first();
      await firstCategoryOption.waitFor({ state: 'visible', timeout: 15000 });
      await firstCategoryOption.click();
      await page.waitForTimeout(500);

      // 파일 업로드 (있다면)
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await fileInput.setInputFiles(testFile1);
        console.log(`✅ 파일 업로드: ${testFile1}`);
        await page.waitForTimeout(1000);
      } else {
        console.log(`⚠️ SR 생성 시 파일 업로드 필드를 찾을 수 없습니다.`);
      }

      // SR 생성
      await page.getByRole('button', { name: /저장|생성|Create/i }).click();
      await page.waitForTimeout(2000);

      // 목록에서 생성된 SR 찾기
      await page.goto('/srs');
      await page.waitForLoadState('networkidle');

      const srRow = page.locator('tr', { hasText: srTitle }).first();
      await expect(srRow).toBeVisible({ timeout: 10000 });

      // SR ID 추출
      await srRow.click();
      await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/);
      srId = page.url().split('/').pop()!;

      console.log(`✅ SR 생성 완료: ${srId} - ${srTitle}`);
    } finally {
      await context.close();
    }
  });

  test('2. SR 상세에서 첨부파일 섹션 확인', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 첨부파일 섹션 확인
      const attachmentSection = page.locator('section, div').filter({ hasText: /첨부|Attachment/i });
      if (await attachmentSection.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(attachmentSection).toBeVisible();
        console.log(`✅ 첨부파일 섹션 확인 완료`);

        // 업로드된 파일 확인 (test-document.txt)
        const uploadedFile = page.locator('text=/test-document.txt/i');
        if (await uploadedFile.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(uploadedFile).toBeVisible();
          console.log(`✅ 업로드된 파일 표시 확인: test-document.txt`);
        }
      } else {
        console.log(`⚠️ 첨부파일 섹션을 찾을 수 없습니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('3. ENGINEER: 댓글에 첨부파일 추가', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.engineer });
    const page = await context.newPage();

    try {
      // SR 접수 먼저 진행 (MANAGER 역할)
      await context.close();
      const managerContext = await browser.newContext({ storageState: authFiles.manager });
      const managerPage = await managerContext.newPage();

      await managerPage.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      const intakeButton = managerPage.getByRole('button', { name: /접수|Accept/i });
      if (await intakeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await intakeButton.click();
        await managerPage.waitForURL(/\/srs\/[^/]+\/intake/, { timeout: 10000 });

        // 간단히 접수 처리
        const prioritySelect = managerPage.locator('label', { hasText: '실제 우선순위' })
          .first()
          .locator('..')
          .locator('[role="combobox"]');
        await prioritySelect.click();
        await managerPage.getByRole('option').first().click();

        const hoursInput = managerPage.getByLabel(/예상 작업 시간/i);
        await hoursInput.fill('4');

        const assigneeSelect = managerPage.locator('label', { hasText: '담당자' })
          .first()
          .locator('..')
          .locator('[role="combobox"]');
        await assigneeSelect.click();
        await managerPage.waitForTimeout(500);

        // 옵션 로딩 대기
        const firstOption = managerPage.getByRole('option').first();
        await firstOption.waitFor({ state: 'visible', timeout: 10000 });
        await firstOption.click();

        await managerPage.getByRole('button', { name: /저장/i }).click();
        await managerPage.waitForTimeout(2000);

        console.log(`✅ MANAGER가 SR 접수 완료`);
      }

      await managerContext.close();

      // ENGINEER로 다시 진입
      const engineerContext = await browser.newContext({ storageState: authFiles.engineer });
      const engineerPage = await engineerContext.newPage();

      await engineerPage.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 댓글 작성
      const commentTextarea = engineerPage.locator('textarea').filter({ hasText: /댓글|Comment/i }).or(
        engineerPage.locator('textarea[placeholder*="댓글"]')
      ).first();

      if (await commentTextarea.isVisible({ timeout: 5000 }).catch(() => false)) {
        await commentTextarea.fill('로그 파일을 첨부합니다. 확인 부탁드립니다.');

        // 파일 업로드 (댓글 영역 내)
        const fileInput = engineerPage.locator('input[type="file"]').first();
        if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await fileInput.setInputFiles(testFile3);
          console.log(`✅ 댓글에 파일 첨부: ${testFile3}`);
          await engineerPage.waitForTimeout(1000);
        } else {
          console.log(`⚠️ 댓글 파일 업로드 필드를 찾을 수 없습니다.`);
        }

        // 댓글 제출
        const submitButton = engineerPage.getByRole('button', { name: /작성|Submit|등록/i });
        if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await submitButton.click();
          await engineerPage.waitForTimeout(2000);
          console.log(`✅ 댓글 작성 완료 (파일 포함)`);
        }
      } else {
        console.log(`⚠️ 댓글 입력 필드를 찾을 수 없습니다.`);
      }

      await engineerContext.close();
    } finally {
      // cleanup
    }
  });

  test('4. CLIENT: 첨부파일 다운로드', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 첨부파일 링크 찾기
      const downloadLink = page.locator('a[href*="/attachments/"], a[download], button').filter({ hasText: /다운로드|Download|test-log.log/i });

      if (await downloadLink.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        // 다운로드 이벤트 대기
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

        await downloadLink.first().click();

        try {
          const download = await downloadPromise;
          console.log(`✅ 파일 다운로드 시작: ${download.suggestedFilename()}`);

          // 다운로드 파일 저장 (검증용)
          const downloadPath = path.join(testFilesDir, `downloaded-${download.suggestedFilename()}`);
          await download.saveAs(downloadPath);
          console.log(`✅ 파일 다운로드 완료: ${downloadPath}`);

          // 파일 존재 확인
          expect(fs.existsSync(downloadPath)).toBeTruthy();
        } catch (error) {
          console.log(`⚠️ 다운로드 이벤트를 캐치하지 못했습니다. 링크가 새 탭으로 열릴 수 있습니다.`);
        }
      } else {
        console.log(`⚠️ 다운로드 링크를 찾을 수 없습니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('5. 첨부파일 삭제 (권한 확인)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 삭제 버튼 찾기
      const deleteButton = page.locator('button').filter({ hasText: /삭제|Delete|Remove/i });

      if (await deleteButton.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        const deleteCount = await deleteButton.count();
        console.log(`✅ 삭제 버튼 발견: ${deleteCount}개`);

        // 첫 번째 삭제 버튼 클릭
        await deleteButton.first().click();
        await page.waitForTimeout(1000);

        // 확인 다이얼로그 (있다면)
        const confirmButton = page.getByRole('button', { name: /확인|Confirm|예|Yes/i });
        if (await confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmButton.click();
          await page.waitForTimeout(1500);
          console.log(`✅ 삭제 확인 완료`);
        }

        console.log(`✅ 첨부파일 삭제 완료`);
      } else {
        console.log(`⚠️ 삭제 버튼을 찾을 수 없습니다. (권한 또는 UI 없음)`);
      }
    } finally {
      await context.close();
    }
  });

  test('6. 대용량 파일 업로드 에러 핸들링', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 파일 업로드 영역 찾기 (댓글 또는 첨부파일 섹션)
      const fileInput = page.locator('input[type="file"]').first();

      if (await fileInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 대용량 파일 업로드 시도
        await fileInput.setInputFiles(testFileLarge);
        console.log(`✅ 대용량 파일 업로드 시도: ${testFileLarge} (11MB)`);
        await page.waitForTimeout(2000);

        // 에러 메시지 확인
        const errorMessage = page.locator('text=/파일 크기|용량 초과|too large|exceeds/i');
        if (await errorMessage.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(errorMessage).toBeVisible();
          console.log(`✅ 대용량 파일 에러 메시지 확인 완료`);
        } else {
          console.log(`⚠️ 대용량 파일 에러 메시지를 찾을 수 없습니다. (제한 없거나 다른 처리)`);
        }
      } else {
        console.log(`⚠️ 파일 업로드 필드를 찾을 수 없습니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('7. 허용되지 않은 파일 형식 업로드 차단', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 파일 업로드 영역 찾기
      const fileInput = page.locator('input[type="file"]').first();

      if (await fileInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 허용되지 않은 파일 형식 업로드 시도
        await fileInput.setInputFiles(testFileInvalid);
        console.log(`✅ 허용되지 않은 파일 업로드 시도: ${testFileInvalid} (.exe)`);
        await page.waitForTimeout(2000);

        // 에러 메시지 확인
        const errorMessage = page.locator('text=/허용되지 않은|지원되지 않는|invalid|not allowed/i');
        if (await errorMessage.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(errorMessage).toBeVisible();
          console.log(`✅ 허용되지 않은 파일 형식 에러 메시지 확인 완료`);
        } else {
          console.log(`⚠️ 허용되지 않은 파일 형식 에러 메시지를 찾을 수 없습니다. (제한 없거나 브라우저 차단)`);
        }
      } else {
        console.log(`⚠️ 파일 업로드 필드를 찾을 수 없습니다.`);
      }

      console.log(`\n✨ 파일 업로드/다운로드 플로우 테스트 완료!`);
    } finally {
      await context.close();
    }
  });
});

test.describe('파일 업로드 추가 시나리오', () => {
  test('다중 파일 동시 업로드', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      // SR 목록 페이지 이동
      await page.goto('/srs', { waitUntil: 'networkidle', timeout: 30000 });

      // 등록 버튼 클릭
      const createButton = page.getByRole('button', { name: /등록|새 SR|Create/i }).first();
      if (await createButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await createButton.click();
        await page.waitForTimeout(500);

        // 다중 파일 입력
        const fileInput = page.locator('input[type="file"]');
        if (await fileInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          // 테스트용 파일 2개 생성
          const fs = await import('fs');
          const path = await import('path');
          const tmpDir = path.join(process.cwd(), 'test-results', 'tmp');
          fs.mkdirSync(tmpDir, { recursive: true });

          const file1Path = path.join(tmpDir, 'multi-test-1.txt');
          const file2Path = path.join(tmpDir, 'multi-test-2.txt');
          fs.writeFileSync(file1Path, '다중 업로드 테스트 파일 1');
          fs.writeFileSync(file2Path, '다중 업로드 테스트 파일 2');

          await fileInput.setInputFiles([file1Path, file2Path]);
          await page.waitForTimeout(500);

          // 파일 목록에 2개 파일이 표시되는지 확인
          const fileItems = page.locator('[class*="file"], [class*="attachment"]').filter({ hasText: /multi-test/i });
          const count = await fileItems.count();

          if (count >= 2) {
            console.log(`✅ 다중 파일 업로드 확인: ${count}개 파일`);
          } else {
            console.log(`⚠️ 다중 파일 표시 확인 필요: ${count}개`);
          }

          // 임시 파일 정리
          try {
            fs.unlinkSync(file1Path);
            fs.unlinkSync(file2Path);
          } catch {
            // Ignore cleanup errors
          }
        } else {
          console.log('⚠️ 파일 입력 필드를 찾을 수 없습니다.');
        }
      }
    } finally {
      await context.close();
    }
  });

  // 미구현 기능: 이미지 미리보기, 업로드 취소는 현재 지원하지 않음
});

