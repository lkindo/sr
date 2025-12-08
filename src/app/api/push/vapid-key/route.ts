import { NextResponse } from "next/server";

// VAPID public key를 반환하는 API
// NEXT_PUBLIC_ 환경 변수가 Vercel에서 인식되지 않는 문제 우회용
export async function GET() {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!vapidPublicKey) {
        return NextResponse.json(
            { error: "VAPID public key is not configured" },
            { status: 500 }
        );
    }

    return NextResponse.json({ vapidPublicKey });
}
