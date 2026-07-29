import { NextResponse } from 'next/server';

import { PushService } from '@/services/push.service';

// VAPID public key를 반환하는 API
// Public key는 클라이언트에 노출되어도 안전함
// Private key만 서버에서 비밀로 유지하면 됨

export async function GET() {
  // 서버가 서명할 수 없는 키를 넘기면 구독은 성공하고 발송만 조용히 실패한다.
  // 따라서 사용 가능한 키가 없으면 키 대신 명시적으로 503을 반환한다.
  if (!PushService.isConfigured()) {
    return NextResponse.json(
      { error: '푸시 알림이 서버에 설정되어 있지 않습니다. 관리자에게 문의해주세요.' },
      { status: 503 }
    );
  }

  return NextResponse.json({ vapidPublicKey: PushService.getPublicKey() });
}
