import { NextResponse } from "next/server";

// VAPID public key를 반환하는 API
// NEXT_PUBLIC_ 환경 변수가 Vercel에서 인식되지 않는 문제 우회용
export async function GET() {
    // 여러 환경 변수 이름 시도
    const vapidPublicKey =
        process.env.VAPID_PUBLIC_KEY ||
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
        process.env.VAPID_KEY;

    // 디버그 정보
    const debug = {
        hasVAPID_PUBLIC_KEY: !!process.env.VAPID_PUBLIC_KEY,
        hasNEXT_PUBLIC_VAPID_PUBLIC_KEY: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        hasVAPID_KEY: !!process.env.VAPID_KEY,
        nodeEnv: process.env.NODE_ENV,
        vercel: process.env.VERCEL,
    };

    console.log('[VAPID API] Debug:', debug);

    if (!vapidPublicKey) {
        return NextResponse.json(
            {
                error: "VAPID public key is not configured",
                debug,
                hint: "Please add VAPID_PUBLIC_KEY to Vercel Environment Variables"
            },
            { status: 500 }
        );
    }

    return NextResponse.json({ vapidPublicKey });
}
