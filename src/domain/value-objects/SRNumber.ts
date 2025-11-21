/**
 * SR Number Value Object
 *
 * SR 번호를 나타내는 불변 객체입니다.
 * 형식: SR-YYYYMMDD-NNNN (예: SR-20250121-0001)
 */

export class SRNumber {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  /**
   * SR 번호 생성 (유효성 검증 포함)
   */
  static create(value: string): SRNumber {
    if (!value) {
      throw new Error('SR 번호는 필수입니다.');
    }

    const srNumberRegex = /^SR-\d{8}-\d{4}$/;

    if (!srNumberRegex.test(value)) {
      throw new Error('유효하지 않은 SR 번호 형식입니다. (형식: SR-YYYYMMDD-NNNN)');
    }

    return new SRNumber(value);
  }

  /**
   * 날짜 기반으로 SR 번호 생성
   */
  static generate(date: Date, sequence: number): SRNumber {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const seq = String(sequence).padStart(4, '0');

    const value = `SR-${year}${month}${day}-${seq}`;
    return new SRNumber(value);
  }

  /**
   * SR 번호 값 반환
   */
  get value(): string {
    return this._value;
  }

  /**
   * 날짜 부분 추출
   * @example "SR-20250121-0001" -> "20250121"
   */
  get datePart(): string {
    return this._value.split('-')[1];
  }

  /**
   * 순번 부분 추출
   * @example "SR-20250121-0001" -> "0001"
   */
  get sequencePart(): string {
    return this._value.split('-')[2];
  }

  /**
   * 순번을 숫자로 반환
   * @example "SR-20250121-0001" -> 1
   */
  get sequenceNumber(): number {
    return parseInt(this.sequencePart, 10);
  }

  /**
   * SR 생성 날짜 반환
   */
  get date(): Date {
    const datePart = this.datePart;
    const year = parseInt(datePart.substring(0, 4), 10);
    const month = parseInt(datePart.substring(4, 6), 10) - 1;
    const day = parseInt(datePart.substring(6, 8), 10);

    return new Date(year, month, day);
  }

  /**
   * 동등성 비교
   */
  equals(other: SRNumber): boolean {
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
