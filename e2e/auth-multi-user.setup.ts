import { test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import {
  assertSessionRoles,
  LEGACY_PERSONAS,
  loginAs,
  type Persona,
  ROLE_PERSONAS,
} from './helpers/auth-helpers';

/**
 * 다중 사용자 인증 설정
 *
 * 페르소나 정의는 helpers/auth-helpers.ts가 단일 진실 공급원이다.
 * 로그인 후 반드시 세션 역할을 검증하므로, 시드가 바뀌어 페르소나가 다른 역할이 되면
 * 스펙이 아니라 이 setup이 먼저 빨갛게 실패한다.
 *
 * 테스트 제목의 @role-persona 태그로 프로젝트를 분리한다:
 *  - 태그 없음      → multi-user-setup (기존 스위트가 의존)
 *  - @role-persona → role-persona-setup (시드 계약이 갖춰져야 통과)
 */

const authDir = path.join(__dirname, '../playwright/.auth');

// 인증 디렉토리 생성
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

function registerPersonaSetup(persona: Persona, titleSuffix = '') {
  setup(`authenticate as ${persona.name}${titleSuffix}`, async ({ page }) => {
    console.log(`🔐 ${persona.name} 로그인 중... (${persona.email})`);

    await loginAs(page, persona);

    // 이름이 아니라 실제 세션으로 역할을 확인한다 — 이 단언이 3.38 재발 방지 장치다.
    await assertSessionRoles(page, persona);

    console.log(
      `✅ ${persona.name} 로그인 및 역할 검증 성공 (${persona.expectedRoles.join(', ')})`
    );

    // 주요 페이지 워밍업 (관리자 세션만 — Next.js 사전 컴파일 목적)
    if (persona.expectedRoles.includes('ADMIN')) {
      console.log(`🔥 ${persona.name} 페이지 워밍업 중...`);
      for (const pagePath of ['/dashboard']) {
        try {
          await page.goto(pagePath, { waitUntil: 'domcontentloaded', timeout: 15000 });
          // allow-fixed-wait -- global-setup.ts 와 같은 이유. Next.js 사전 컴파일 유발이
          // 목적이라 기다릴 응답이 없다.
          await page.waitForTimeout(500);
          console.log(`  ✓ ${pagePath} 워밍업 완료`);
        } catch {
          console.log(`  ⚠ ${pagePath} 워밍업 실패 (무시)`);
        }
      }
    }

    // 인증 상태 저장
    await page.context().storageState({ path: persona.authFile });

    console.log(`✅ ${persona.name} 인증 상태 저장 완료: ${persona.authFile}`);
  });
}

// 기존 페르소나 (client / legacy-manager / engineer)
for (const persona of LEGACY_PERSONAS) {
  registerPersonaSetup(persona);
}

// 신규 역할 페르소나 (MANAGER / CLIENT_ADMIN) — 시드 계약 필요
for (const persona of ROLE_PERSONAS) {
  registerPersonaSetup(persona, ' @role-persona');
}
