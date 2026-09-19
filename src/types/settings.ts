/** 시스템 설정 화면이 보여 주는 값. 모두 **실제로 적용 중인** 값이며 화면에서 바꿀 수 없다. */
export interface SystemSettings {
  session: {
    /** 입력이 없으면 로그아웃되는 시간(분). src/lib/constants/session.ts 의 IDLE_TIMEOUT_MS. */
    idleLogoutMinutes: number;
    /** 로그아웃 전 경고를 띄우는 시간(분). IDLE_WARNING_MS. */
    idleWarningMinutes: number;
    /**
     * 마지막 사용으로부터 로그인 토큰(JWT 쿠키)이 유지되는 시간(시간). 사용할 때마다 연장되므로 절대 상한이
     * 아니다. src/auth.config.ts 의 SESSION_MAX_AGE_SECONDS.
     */
    tokenMaxAgeHours: number;
    /** 로그인한 뒤 사용 중이어도 다시 로그인해야 하는 시간(시간). SESSION_ABSOLUTE_MAX_AGE_SECONDS(결정 D13). */
    absoluteMaxAgeHours: number;
  };
  /** 계정 단위 로그인 실패 잠금(결정 D13). src/lib/constants/session.ts 의 LOGIN_LOCK_POLICY. */
  loginLock: { maxFailures: number; windowMinutes: number; lockMinutes: number };
  /** 비밀번호 정책(src/lib/schemas.ts 의 passwordSchema 와 같은 상수에서 만든 문장). */
  passwordPolicy: string;
  /**
   * 메일 발송에 쓰는 SMTP 서버. configured=false 면 호스트 환경변수가 없어 기본값을 쓰는 중이다.
   * credentialsConfigured=false 면 계정 환경변수가 없어 발송이 실패한다(값 자체는 싣지 않는다).
   */
  mailServer: { host: string; port: number; configured: boolean; credentialsConfigured: boolean };
}
