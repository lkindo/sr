import { render } from '@react-email/render';
import { Resend } from 'resend';

import SRAssignedEmail from '@/emails/SRAssignedEmail';
import SRCreatedEmail from '@/emails/SRCreatedEmail';
import SRStatusChangedEmail from '@/emails/SRStatusChangedEmail';
import { getAppUrl } from '@/lib/app-url';
import { logger } from '@/lib/logger';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.EMAIL_FROM || 'SR Management <noreply@sr-system.com>';
const BASE_URL = getAppUrl();

interface SendSRCreatedEmailParams {
  to: string;
  srId: string;
  srNumber: string;
  title: string;
  description: string;
  priority: string;
  clientName: string;
  requesterName: string;
  requesterEmail: string;
}

export async function sendSRCreatedEmail({
  to,
  srId,
  srNumber,
  title,
  description,
  priority,
  clientName,
  requesterName,
  requesterEmail,
}: SendSRCreatedEmailParams) {
  if (!resend) {
    logger.warn('[email] RESEND_API_KEY is not configured. Skipping email.');
    return null;
  }

  const srUrl = `${BASE_URL}/srs/${srId}`;

  try {
    const emailHtml = await render(
      SRCreatedEmail({
        srNumber,
        title,
        description,
        priority,
        clientName,
        requesterName,
        requesterEmail,
        srUrl,
      })
    );

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `[SR] 새로운 SR이 생성되었습니다: ${srNumber}`,
      html: emailHtml,
    });

    if (error) {
      logger.error('Failed to send SR created email:', error as Error);
      throw new Error(error.message);
    }

    logger.info('SR created email sent:', { data });
    return data;
  } catch (error) {
    logger.error('Error sending SR created email:', error as Error);
    throw error;
  }
}

interface SendSRStatusChangedEmailParams {
  to: string;
  srId: string;
  srNumber: string;
  title: string;
  fromStatus: string;
  toStatus: string;
  changeReason?: string;
  changedByName: string;
  clientName: string;
}

export async function sendSRStatusChangedEmail({
  to,
  srId,
  srNumber,
  title,
  fromStatus,
  toStatus,
  changeReason,
  changedByName,
  clientName,
}: SendSRStatusChangedEmailParams) {
  if (!resend) {
    logger.warn('[email] RESEND_API_KEY is not configured. Skipping email.');
    return null;
  }

  const srUrl = `${BASE_URL}/srs/${srId}`;

  try {
    const emailHtml = await render(
      SRStatusChangedEmail({
        srNumber,
        title,
        fromStatus,
        toStatus,
        changeReason,
        changedByName,
        clientName,
        srUrl,
      })
    );

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `[SR] SR 상태가 변경되었습니다: ${srNumber}`,
      html: emailHtml,
    });

    if (error) {
      logger.error('Failed to send SR status changed email:', error as Error);
      throw new Error(error.message);
    }

    logger.info('SR status changed email sent:', { data });
    return data;
  } catch (error) {
    logger.error('Error sending SR status changed email:', error as Error);
    throw error;
  }
}

interface SendSRAssignedEmailParams {
  to: string;
  srId: string;
  srNumber: string;
  title: string;
  description: string;
  priority: string;
  clientName: string;
  assignedToName: string;
  assignedByName: string;
}

export async function sendSRAssignedEmail({
  to,
  srId,
  srNumber,
  title,
  description,
  priority,
  clientName,
  assignedToName,
  assignedByName,
}: SendSRAssignedEmailParams) {
  if (!resend) {
    logger.warn('[email] RESEND_API_KEY is not configured. Skipping email.');
    return null;
  }

  const srUrl = `${BASE_URL}/srs/${srId}`;

  try {
    const emailHtml = await render(
      SRAssignedEmail({
        srNumber,
        title,
        description,
        priority,
        clientName,
        assignedToName,
        assignedByName,
        srUrl,
      })
    );

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `[SR] 새로운 SR이 배정되었습니다: ${srNumber}`,
      html: emailHtml,
    });

    if (error) {
      logger.error('Failed to send SR assigned email:', error as Error);
      throw new Error(error.message);
    }

    logger.info('SR assigned email sent:', { data });
    return data;
  } catch (error) {
    logger.error('Error sending SR assigned email:', error as Error);
    throw error;
  }
}

// 댓글 알림 이메일
interface SendCommentNotificationEmailParams {
  to: string;
  srId: string;
  srNumber: string;
  title: string;
  commentAuthor: string;
  commentContent: string;
}

export async function sendCommentNotificationEmail({
  to,
  srId,
  srNumber,
  title,
  commentAuthor,
  commentContent,
}: SendCommentNotificationEmailParams) {
  if (!resend) {
    logger.warn('[email] RESEND_API_KEY is not configured. Skipping email.');
    return null;
  }

  const srUrl = `${BASE_URL}/srs/${srId}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `[SR] 새로운 댓글이 등록되었습니다: ${srNumber}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>새로운 댓글이 등록되었습니다</h2>
          <p><strong>SR:</strong> ${srNumber} - ${title}</p>
          <p><strong>작성자:</strong> ${commentAuthor}</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; white-space: pre-wrap;">${commentContent}</p>
          </div>
          <a href="${srUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
            SR 확인하기
          </a>
        </div>
      `,
    });

    if (error) {
      logger.error('Failed to send comment notification email:', error as Error);
      throw new Error(error.message);
    }

    logger.info('Comment notification email sent:', { data });
    return data;
  } catch (error) {
    logger.error('Error sending comment notification email:', error as Error);
    throw error;
  }
}
