import { NextResponse } from "next/server";

// VAPID public key를 반환하는 API
// Public key는 클라이언트에 노출되어도 안전함
// Private key만 서버에서 비밀로 유지하면 됨

// 환경 변수에서 가져오거나, 설정되지 않은 경우 하드코딩된 값 사용
const VAPID_PUBLIC_KEY_FALLBACK = "BMy2SareYpfTG73Ts9NjlQVhbwStorMrw_v2XrZi1JYA_V6vrL4iuVBAoBV1FUOPFLfsa-qsQ5O5Zvggv9DlMc4";

export async function GET() {
    const vapidPublicKey =
        process.env.VAPID_PUBLIC_KEY ||
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
        VAPID_PUBLIC_KEY_FALLBACK;

    return NextResponse.json({ vapidPublicKey });
}
