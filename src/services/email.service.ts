import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";


interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST || "smtp.gmail.com",
      port: Number(process.env.EMAIL_SERVER_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false // 개발 환경에서 로컬 인증서 문제 방지
      }
    });
  }

  async sendMail({ to, subject, html }: EmailOptions): Promise<void> {
    // 개발 환경이나 설정이 없는 경우 스킵
    if (!process.env.EMAIL_SERVER_USER || !process.env.EMAIL_SERVER_PASSWORD) {
      logger.warn("[EmailService] Email credentials not found. Skipping email sending.");
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || '"SR System" <no-reply@sr-system.com>',
        to,
        subject,
        html,
      });
      logger.info(`[EmailService] Email sent: ${info.messageId}`);
    } catch (error) {
      logger.error("[EmailService] Error sending email:", error as Error);
    }
  }

  async sendSRCreated(to: string, srNumber: string, title: string, requesterName: string, link: string) {
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
    await this.sendMail({ to, subject, html });
  }

  async sendSRAssigned(to: string, srNumber: string, title: string, assigneeName: string, link: string) {
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
    await this.sendMail({ to, subject, html });
  }

  async sendSRStatusChanged(to: string, srNumber: string, title: string, oldStatus: string, newStatus: string, link: string) {
    const subject = `[SR System] SR 상태가 변경되었습니다: ${srNumber}`;
    const statusMap: Record<string, string> = {
      REQUESTED: "요청됨",
      INTAKE: "접수",
      IN_PROGRESS: "진행중",
      ON_HOLD: "보류",
      COMPLETED: "완료",
      CONFIRMED: "확인완료",
      REJECTED: "거절됨",
    };

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">SR 상태 변경 알림</h2>
        <p><strong>SR 번호:</strong> ${srNumber}</p>
        <p><strong>제목:</strong> ${title}</p>
        <p><strong>상태:</strong> ${statusMap[oldStatus] || oldStatus} ➡️ <span style="color: #0070f3; font-weight: bold;">${statusMap[newStatus] || newStatus}</span></p>
        <a href="${link}" style="display: inline-block; background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">SR 확인하기</a>
      </div>
    `;
    await this.sendMail({ to, subject, html });
  }

  async sendCommentAdded(to: string, srNumber: string, title: string, commenterName: string, commentContent: string, link: string) {
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
    await this.sendMail({ to, subject, html });
  }
}

export const emailService = new EmailService();
