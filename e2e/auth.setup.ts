import { test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { ADMIN_PERSONA, assertSessionRoles, loginAs } from './helpers/auth-helpers';

/**
 * 단일 사용자(관리자) 인증 설정 — playwright/.auth/user.json 생성.
 *
 * 이전 버전은 `input[name="email"]` 셀렉터를 썼는데 로그인 폼에는 name 속성이 없고
 * id만 있어(#email/#password) 절대 매칭되지 않았다. 게다가 어떤 프로젝트의 testMatch에도
 * 걸리지 않아 실행조차 되지 않는 죽은 파일이었다.
 * 이제 `setup` 프로젝트가 이 파일을 실행하며, 로그인 후 세션 역할까지 검증한다.
 */

const authDir = path.join(__dirname, '../playwright/.auth');

if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

setup('authenticate as admin', async ({ page }) => {
  await loginAs(page, ADMIN_PERSONA);

  // 로그인이 조용히 실패한 채(익명 세션) 통과하는 것을 막는다.
  await assertSessionRoles(page, ADMIN_PERSONA);

  await page.context().storageState({ path: ADMIN_PERSONA.authFile });

  console.log(`✅ admin 인증 상태 저장 완료: ${ADMIN_PERSONA.authFile}`);
});
