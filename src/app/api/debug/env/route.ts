import { NextResponse } from "next/server";

// 환경 변수 디버깅용 API - 모든 알림 관련 환경 변수 확인
// 배포 후 삭제 필요!
export async function GET() {
    const envStatus = {
        // Database (작동 확인용)
        DATABASE_URL: !!process.env.DATABASE_URL,

        // VAPID (웹푸시)
        VAPID_PUBLIC_KEY: !!process.env.VAPID_PUBLIC_KEY,
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
        VAPID_SUBJECT: !!process.env.VAPID_SUBJECT,

        // Email (Resend)
        RESEND_API_KEY: !!process.env.RESEND_API_KEY,

        // Email (SMTP)
        EMAIL_SERVER_HOST: !!process.env.EMAIL_SERVER_HOST,
        EMAIL_SERVER_USER: !!process.env.EMAIL_SERVER_USER,
        EMAIL_SERVER_PASSWORD: !!process.env.EMAIL_SERVER_PASSWORD,

        // Mattermost
        MATTERMOST_WEBHOOK_URL: !!process.env.MATTERMOST_WEBHOOK_URL,

        // App URL
        NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,

        // Meta
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
    };

    return NextResponse.json(envStatus);
}
