/** 시스템 설정 화면이 보여 주는 값. 모두 **실제로 적용 중인** 값이며 화면에서 바꿀 수 없다. */
export interface SystemSettings {
  session: {
    /** 입력이 없으면 로그아웃되는 시간(분). src/lib/constants/session.ts 의 IDLE_TIMEOUT_MS. */
    idleLogoutMinutes: number;
    /** 로그아웃 전 경고를 띄우는 시간(분). IDLE_WARNING_MS. */
    idleWarningMinutes: number;
    /** 로그인 토큰(JWT 쿠키) 수명의 상한(시간). src/auth.config.ts 의 SESSION_MAX_AGE_SECONDS. */
    tokenMaxAgeHours: number;
  };
  /** 비밀번호 정책(src/lib/schemas.ts 의 passwordSchema 와 같은 상수에서 만든 문장). */
  passwordPolicy: string;
  /**
   * 메일 발송에 쓰는 SMTP 서버. configured=false 면 호스트 환경변수가 없어 기본값을 쓰는 중이다.
   * credentialsConfigured=false 면 계정 환경변수가 없어 발송이 실패한다(값 자체는 싣지 않는다).
   */
  mailServer: { host: string; port: number; configured: boolean; credentialsConfigured: boolean };
}
