import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Store original env values
const originalEnv = { ...process.env };

// Mock nodemailer at the top level
const mockSendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '@/lib/logger';

/**
 * 이 테스트는 원래 "설정이 없으면 스킵하고 warn 을 남긴다", "전송 실패 시 error 로그를
 * 남긴다"를 정상 동작으로 못 박고 있었다. 그게 감사 4.2 가 지적한 결함 자체다 —
 * `sendMail` 이 오류를 삼키고 void 를 반환하니 호출부는 실패를 알 방법이 없었고,
 * `Promise.allSettled` 가 rejection 을 한 번 더 삼켜 결과가 항상 fulfilled 였다.
 *
 * 이제 `sendMail` 은 실패하면 던진다. 아웃박스 디스패처가 그 예외를 받아 `failReason` 에
 * 기록하고 백오프 후 재시도한다. 던지지 않으면 그 기록이 원천적으로 불가능하다.
 * 템플릿은 `buildX` 로 분리되어 발송 없이 렌더 결과만 검증할 수 있다.
 */
describe('EmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: 'test-123' });

    process.env.EMAIL_SERVER_USER = 'test@example.com';
    process.env.EMAIL_SERVER_PASSWORD = 'password123';
    process.env.EMAIL_FROM = '"Test" <test@example.com>';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('sendMail', () => {
    it('전송에 성공하면 info 로그를 남긴다', async () => {
      vi.resetModules();
      const { emailService } = await import('../email.service');

      await emailService.sendMail({ to: 'a@test.com', subject: '제목', html: '<p>본문</p>' });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@test.com', subject: '제목' })
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Email sent'));
    });

    it('SMTP 실패를 삼키지 않고 던진다', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP Error'));

      vi.resetModules();
      const { emailService } = await import('../email.service');

      // 예전에는 여기서 조용히 resolve 했고, 그래서 아무도 실패를 알 수 없었다.
      await expect(
        emailService.sendMail({ to: 'a@test.com', subject: '제목', html: 'x' })
      ).rejects.toThrow('SMTP Error');
    });

    it('자격증명이 없으면 성공한 척하지 않고 던진다', async () => {
      delete process.env.EMAIL_SERVER_USER;
      delete process.env.EMAIL_SERVER_PASSWORD;

      vi.resetModules();
      const { emailService } = await import('../email.service');

      // 예전에는 warn 한 줄만 찍고 넘어가서, 환경 변수 하나가 빠지면 알림이 통째로
      // 안 나가는데도 애플리케이션은 정상으로 보였다.
      await expect(
        emailService.sendMail({ to: 'a@test.com', subject: '제목', html: 'x' })
      ).rejects.toThrow(/자격증명/);
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('템플릿 렌더(buildX)', () => {
    it('SR 생성: 수신자·제목·본문을 만들고 발송하지 않는다', async () => {
      vi.resetModules();
      const { emailService } = await import('../email.service');

      const mail = emailService.buildSRCreated(
        'admin@test.com',
        'SR-001',
        'Test Title',
        'Test User',
        'http://example.com/sr/1'
      );

      expect(mail.to).toBe('admin@test.com');
      expect(mail.subject).toContain('SR-001');
      expect(mail.html).toContain('Test Title');
      // 렌더는 순수 함수여야 아웃박스에 적재할 수 있다.
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('담당자 배정: 제목에 담당자 문구가 들어간다', async () => {
      vi.resetModules();
      const { emailService } = await import('../email.service');

      const mail = emailService.buildSRAssigned(
        'assignee@test.com',
        'SR-002',
        'Assigned SR',
        'Assignee Name',
        'http://example.com/sr/2'
      );

      expect(mail.to).toBe('assignee@test.com');
      expect(mail.subject).toContain('담당자');
    });

    it('상태 변경: 상태를 한글로 표기한다', async () => {
      vi.resetModules();
      const { emailService } = await import('../email.service');

      const mail = emailService.buildSRStatusChanged(
        'user@test.com',
        'SR-003',
        'Status SR',
        'REQUESTED',
        'IN_PROGRESS',
        'http://example.com/sr/3'
      );

      expect(mail.html).toContain('요청됨');
      expect(mail.html).toContain('진행중');
    });

    it('7개 상태 라벨을 전부 한글로 표기한다 — 정본과 어긋나면 여기서 걸린다', async () => {
      // 메일 문구는 정본의 **의도적 사본**이다(email.service.ts 주석 참조).
      // 값을 여기 문자 그대로 적는다 — 정본을 import 해 비교하면 자동 추종이 되어
      // 감지력이 사라진다. 정본이 바뀌면 이 테스트가 깨지면서 "고객에게 나가는
      // 문구도 바꿀 것인가" 를 사람에게 묻는 것이 목적이다.
      //
      // 예전에는 REQUESTED/IN_PROGRESS 두 키만 단언해서 ON_HOLD 도 REJECTED 도
      // 무방비였다. 실제로 REJECTED 가 '거절됨' 으로 화면('거부')과 어긋나 있었다.
      vi.resetModules();
      const { emailService } = await import('../email.service');

      const expected: Array<[string, string]> = [
        ['REQUESTED', '요청됨'],
        ['INTAKE', '접수'],
        ['IN_PROGRESS', '진행중'],
        ['ON_HOLD', '보류'],
        ['COMPLETED', '완료'],
        ['CONFIRMED', '확인완료'],
        ['REJECTED', '거절'],
      ];

      for (const [status, label] of expected) {
        const mail = emailService.buildSRStatusChanged(
          'user@test.com',
          'SR-777',
          'Label SR',
          status,
          status,
          'http://example.com/sr/777'
        );
        expect(mail.html, `${status} 라벨이 '${label}' 이 아닙니다.`).toContain(label);
        expect(mail.html, `${status} 가 영문 enum 으로 새고 있습니다.`).not.toContain(status);
      }
    });

    it('댓글 추가: 댓글 내용을 본문에 담는다', async () => {
      vi.resetModules();
      const { emailService } = await import('../email.service');

      const mail = emailService.buildCommentAdded(
        'user@test.com',
        'SR-004',
        'Comment SR',
        'Commenter',
        'This is a comment',
        'http://example.com/sr/4'
      );

      expect(mail.html).toContain('This is a comment');
    });
  });
});
