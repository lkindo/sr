import { NextResponse } from "next/server";

// 환경 변수 디버깅용 임시 API
// 배포 후 삭제 필요!
export async function GET() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    return NextResponse.json({
        vapidKeyExists: !!vapidKey,
        vapidKeyLength: vapidKey?.length || 0,
        vapidKeyPrefix: vapidKey?.substring(0, 10) || 'NOT_SET',
        nodeEnv: process.env.NODE_ENV,
        vercel: process.env.VERCEL || 'not_vercel',
    });
}
