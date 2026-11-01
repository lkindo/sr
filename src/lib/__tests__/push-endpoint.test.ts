import { describe, expect, it } from 'vitest';

import { isAllowedPushEndpoint } from '../push-endpoint';

describe('isAllowedPushEndpoint', () => {
  it.each([
    ['Chrome', 'https://fcm.googleapis.com/fcm/send/abc:APA91bXyz_-123'],
    ['Firefox', 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk_-='],
    ['Safari', 'https://web.push.apple.com/QOs-abc_123'],
    ['Edge', 'https://wns2-sg2p.notify.windows.com/w/?token=BQYAAAB%2bxyz%3d'],
  ])('%s 푸시 서비스 주소를 허용한다', (_browser, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ['임의 HTTPS 호스트', 'https://attacker.example.com/collect'],
    ['내부 주소', 'https://10.0.0.5/admin'],
    ['로컬호스트', 'https://localhost/api/health'],
    ['클라우드 메타데이터', 'https://169.254.169.254/opc/v2/instance/'],
    ['HTTP', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['비표준 포트', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
    ['사용자 정보로 호스트 위장', 'https://fcm.googleapis.com@attacker.example.com/x'],
    ['허용 호스트를 앞에 붙인 도메인', 'https://fcm.googleapis.com.attacker.example.com/x'],
    ['점 없는 접미사 위장', 'https://evilnotify.windows.com/w/'],
    ['접미사 뒤 도메인', 'https://a.notify.windows.com.attacker.example.com/w/'],
    ['파서 차이를 노린 역슬래시', 'https://attacker.example.com\\@fcm.googleapis.com/x'],
    ['파서 차이를 노린 세미콜론', 'https://attacker.example.com;.notify.windows.com/a'],
    ['파서 차이를 노린 작은따옴표', "https://attacker.example.com'.notify.windows.com/a"],
    ['파서 차이를 노린 파이프', 'https://attacker.example.com|.push.services.mozilla.com/a'],
    ['정규화되지 않은 대문자 호스트', 'https://FCM.googleapis.com/fcm/send/abc'],
    ['URL 이 아닌 값', 'endpoint-1'],
    ['빈 문자열', ''],
  ])('%s 은(는) 거부한다', (_label, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
