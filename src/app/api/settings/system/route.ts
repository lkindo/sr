// src/app/api/settings/system/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SystemSettings } from '@/types/settings';

// 시스템 설정 가져오기 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    // 관리자 권한 확인
    if (!session?.user || !session.user.roles?.includes('ADMIN')) {
      throw new ForbiddenError('관리자 권한이 필요합니다.');
    }

    // 실제 설정 정보는 데이터베이스나 환경변수에서 가져와야 합니다.
    // 현재는 더미 데이터로 표시
    const settings: SystemSettings = {
      siteName: process.env.SITE_NAME || 'SR Management System v1.0',
      siteDescription: process.env.SITE_DESCRIPTION || '서비스 요청 관리 시스템',
      adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
      smtpHost: process.env.SMTP_HOST || 'smtp.example.com',
      smtpPort: parseInt(process.env.SMTP_PORT || '587'),
      smtpSecurity: process.env.SMTP_SECURITY || 'TLS',
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '24'),
      passwordPolicy: process.env.PASSWORD_POLICY || '최소 6자, 영문/숫자 조합',
      databaseBackupTime: '2025-01-12 10:30',
      cacheStatus: 'enabled',
    };

    return NextResponse.json(settings);
  },
  { preset: 'standard' }
); // 1분당 100회

// 시스템 설정 저장 (Rate Limit: 엄격)
export const PUT = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    // 관리자 권한 확인
    if (!session?.user || !session.user.roles?.includes('ADMIN')) {
      throw new ForbiddenError('관리자 권한이 필요합니다.');
    }

    const settings: SystemSettings = await request.json();

    // 실제 설정 저장 로직은 여기에 구현해야 합니다.
    logger.debug('Updating system settings', { custom_siteName: settings.siteName });

    return NextResponse.json({ message: '시스템 설정이 저장되었습니다.' });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
