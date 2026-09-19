// src/app/api/settings/system/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { SESSION_ABSOLUTE_MAX_AGE_SECONDS, SESSION_MAX_AGE_SECONDS } from '@/auth.config';
import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS, LOGIN_LOCK_POLICY } from '@/lib/constants/session';
import { ensureSystemAdmin } from '@/lib/policies';
import { PASSWORD_POLICY_DESCRIPTION } from '@/lib/schemas';
import { smtpServer } from '@/services/email.service';
import { SystemSettings } from '@/types/settings';

/**
 * 시스템 설정 — **실제로 적용 중인 값**을 읽기 전용으로 돌려준다.
 *
 * 예전 GET 은 앱 어디에서도 읽지 않는 환경변수(SITE_NAME·SMTP_HOST·SESSION_TIMEOUT·PASSWORD_POLICY 등)와
 * 가짜 기본값(세션 24시간, "최소 6자", 마지막 백업 2025-01-12)을 돌려줬고, PUT 은 아무것도 저장하지
 * 않으면서 "시스템 설정이 저장되었습니다" 를 돌려줬다. 저장소(설정 테이블)가 없으므로 PUT 을 걷어냈고,
 * 각 값은 그 정본(세션 상수, 비밀번호 스키마, 메일 발송 설정)에서 읽는다.
 *
 * 세션은 세 값을 함께 준다. 사용자가 실제로 겪는 것은 화면 유휴 로그아웃(30분)이다. 토큰 수명(8시간)은
 * 화면 타이머가 돌지 않을 때(탭을 닫아 둔 경우 등) **마지막 사용으로부터** 유지되는 시간이고 사용할 때마다
 * 연장된다. 그래서 로그인 후 절대 수명(12시간, 결정 D13)을 따로 보여 준다.
 */
export const GET = withAuthAndRateLimit(
  async (_request: NextRequest, { session }) => {
    ensureSystemAdmin(session.user, '관리자 권한이 필요합니다.');

    const settings: SystemSettings = {
      session: {
        idleLogoutMinutes: IDLE_TIMEOUT_MS / 60_000,
        idleWarningMinutes: IDLE_WARNING_MS / 60_000,
        tokenMaxAgeHours: SESSION_MAX_AGE_SECONDS / 3600,
        absoluteMaxAgeHours: SESSION_ABSOLUTE_MAX_AGE_SECONDS / 3600,
      },
      loginLock: { ...LOGIN_LOCK_POLICY },
      passwordPolicy: PASSWORD_POLICY_DESCRIPTION,
      mailServer: smtpServer(),
    };

    return NextResponse.json(settings);
  },
  { preset: 'standard' }
); // 1분당 100회
