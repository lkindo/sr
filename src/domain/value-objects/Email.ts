/**
 * Email Value Object
 *
 * 이메일 주소를 나타내는 불변 객체입니다.
 * DDD의 Value Object 패턴을 따릅니다.
 */

export class Email {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  /**
   * 이메일 생성 (유효성 검증 포함)
   */
  static create(value: string): Email {
    if (!value) {
      throw new Error('이메일은 필수입니다.');
    }

    const trimmed = value.trim().toLowerCase();

    // RFC 5322 간소화된 정규식
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(trimmed)) {
      throw new Error('유효하지 않은 이메일 형식입니다.');
    }

    return new Email(trimmed);
  }

  /**
   * 이메일 값 반환
   */
  get value(): string {
    return this._value;
  }

  /**
   * 도메인 추출
   * @example "user@example.com" -> "example.com"
   */
  get domain(): string {
    return this._value.split('@')[1];
  }

  /**
   * 로컬 부분 추출
   * @example "user@example.com" -> "user"
   */
  get localPart(): string {
    return this._value.split('@')[0];
  }

  /**
   * 동등성 비교
   */
  equals(other: Email): boolean {
    return this._value === other._value;
  }

  /**
   * 문자열 변환
   */
  toString(): string {
    return this._value;
  }

  /**
   * JSON 직렬화
   */
  toJSON(): string {
    return this._value;
  }
}
