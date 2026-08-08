import nodemailer from 'nodemailer';

import { logger } from '@/lib/logger';

/**
 * 렌더된 메일 한 통. `buildX()` 가 이 형태를 돌려주고 아웃박스가 그대로 적재한다.
 * 수신자는 **단건**이다 — 아웃박스는 행 하나가 수신자 하나여야 누가 못 받았는지
 * 개별로 추적할 수 있다. 다중 수신은 행을 여러 개 만든다.
 */
interface RenderedEmail {
  to: string;
  subject: string;
  html: string;
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      pool: true,
      host: process.env.EMAIL_SERVER_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_SERVER_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
      tls: {
        // 프로덕션에서는 반드시 TLS 인증서를 검증한다(MITM 자격증명 탈취 방지).
        // 자체서명 인증서를 쓰는 로컬 개발 환경에서만 검증을 완화한다.
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
      // 외부 SMTP 서버 응답 지연으로 풀 연결이 묶이는 것을 방지
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  /**
   * 실제 SMTP 발송. **실패하면 던진다.**
   *
   * 예전에는 오류를 try/catch 로 삼키고 로그만 남긴 뒤 void 를 반환했다. 호출부가 전부
   * `Promise.allSettled` 로 감쌌으므로 결과가 항상 fulfilled 였고, 실패 경로가 코드상
   * 존재하지 않는 것과 같았다(감사 4.2). 이제 아웃박스 디스패처가 이 예외를 받아
   * `failReason` 에 기록하고 백오프 후 재시도한다 — 던지지 않으면 그 기록이 불가능하다.
   *
   * 자격증명이 없으면 조용히 성공한 척하지 않고 던진다. 예전에는 경고 한 줄만 찍고
   * 넘어가서, 환경 변수 하나가 빠지면 알림이 통째로 안 나가는데도 애플리케이션은
   * 정상으로 보였다. 이제 아웃박스에 실패로 남아 조회된다.
   */
  async sendMail({ to, subject, html }: EmailOptions): Promise<void> {
    if (!process.env.EMAIL_SERVER_USER || !process.env.EMAIL_SERVER_PASSWORD) {
      throw new Error('SMTP 자격증명이 설정되지 않았습니다(EMAIL_SERVER_USER/PASSWORD).');
    }

    const info = await this.transporter.sendMail({
      from: process.env.EMAIL_FROM || '"SR System" <no-reply@sr-system.com>',
      to,
      subject,
      html,
    });
    logger.info(`[EmailService] Email sent: ${info.messageId}`);
  }

  buildSRCreated(
    to: string,
    srNumber: string,
    title: string,
    requesterName: string,
    link: string
  ): RenderedEmail {
    const subject = `[SR System] 새로운 SR이 생성되었습니다: ${srNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">새로운 SR 요청</h2>
        <p><strong>SR 번호:</strong> ${srNumber}</p>
        <p><strong>제목:</strong> ${title}</p>
        <p><strong>요청자:</strong> ${requesterName}</p>
        <p>아래 링크를 클릭하여 상세 내용을 확인하세요:</p>
        <a href="${link}" style="display: inline-block; background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">SR 확인하기</a>
        <hr style="margin-top: 20px; border: none; border-top: 1px solid #eee;" />
        <p style="color: #888; font-size: 12px;">이 메일은 발신 전용입니다.</p>
      </div>
    `;
    return { to, subject, html };
  }

  buildSRAssigned(
    to: string,
    srNumber: string,
    title: string,
    assigneeName: string,
    link: string
  ): RenderedEmail {
    const subject = `[SR System] SR 담당자가 배정되었습니다: ${srNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">SR 담당자 배정 알림</h2>
        <p><strong>SR 번호:</strong> ${srNumber}</p>
        <p><strong>제목:</strong> ${title}</p>
        <p><strong>담당자:</strong> ${assigneeName}</p>
        <p>지금 바로 확인해보세요:</p>
        <a href="${link}" style="display: inline-block; background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">SR 확인하기</a>
      </div>
    `;
    return { to, subject, html };
  }

  buildSRStatusChanged(
    to: string,
    srNumber: string,
    title: string,
    oldStatus: string,
    newStatus: string,
    link: string
  ): RenderedEmail {
    const subject = `[SR System] SR 상태가 변경되었습니다: ${srNumber}`;
    const statusMap = new Map<string, string>([
      ['REQUESTED', '요청됨'],
      ['INTAKE', '접수'],
      ['IN_PROGRESS', '진행중'],
      ['ON_HOLD', '보류'],
      ['COMPLETED', '완료'],
      ['CONFIRMED', '확인완료'],
      ['REJECTED', '거절됨'],
    ]);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">SR 상태 변경 알림</h2>
        <p><strong>SR 번호:</strong> ${srNumber}</p>
        <p><strong>제목:</strong> ${title}</p>
        <p><strong>상태:</strong> ${statusMap.get(oldStatus) || oldStatus} ➡️ <span style="color: #0070f3; font-weight: bold;">${statusMap.get(newStatus) || newStatus}</span></p>
        <a href="${link}" style="display: inline-block; background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">SR 확인하기</a>
      </div>
    `;
    return { to, subject, html };
  }

  buildCommentAdded(
    to: string,
    srNumber: string,
    title: string,
    commenterName: string,
    commentContent: string,
    link: string
  ): RenderedEmail {
    const subject = `[SR System] SR에 새 댓글이 달렸습니다: ${srNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">새 댓글 알림</h2>
        <p><strong>SR 번호:</strong> ${srNumber}</p>
        <p><strong>작성자:</strong> ${commenterName}</p>
        <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #0070f3; margin: 10px 0;">
          ${commentContent}
        </div>
        <a href="${link}" style="display: inline-block; background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">댓글 확인하기</a>
      </div>
    `;
    return { to, subject, html };
  }
}

export const emailService = new EmailService();
