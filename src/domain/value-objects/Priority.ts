/**
 * Priority Value Object
 *
 * SR 우선순위를 나타내는 불변 객체입니다.
 */

export enum PriorityLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class Priority {
  private readonly _level: PriorityLevel;

  private constructor(level: PriorityLevel) {
    this._level = level;
  }

  /**
   * 우선순위 생성
   */
  static create(value: string): Priority {
    const upperValue = value.toUpperCase();

    if (!Object.values(PriorityLevel).includes(upperValue as PriorityLevel)) {
      throw new Error(`유효하지 않은 우선순위입니다: ${value}`);
    }

    return new Priority(upperValue as PriorityLevel);
  }

  /**
   * 미리 정의된 우선순위 인스턴스
   */
  static readonly LOW = new Priority(PriorityLevel.LOW);
  static readonly MEDIUM = new Priority(PriorityLevel.MEDIUM);
  static readonly HIGH = new Priority(PriorityLevel.HIGH);
  static readonly URGENT = new Priority(PriorityLevel.URGENT);

  /**
   * 우선순위 값 반환
   */
  get value(): PriorityLevel {
    return this._level;
  }

  /**
   * 우선순위 점수 (정렬용)
   */
  get score(): number {
    const scores: Record<PriorityLevel, number> = {
      [PriorityLevel.LOW]: 1,
      [PriorityLevel.MEDIUM]: 2,
      [PriorityLevel.HIGH]: 3,
      [PriorityLevel.URGENT]: 4,
    };

    return scores[this._level];
  }

  /**
   * 우선순위가 더 높은지 비교
   */
  isHigherThan(other: Priority): boolean {
    return this.score > other.score;
  }

  /**
   * 우선순위가 더 낮은지 비교
   */
  isLowerThan(other: Priority): boolean {
    return this.score < other.score;
  }

  /**
   * URGENT 우선순위인지 확인
   */
  isUrgent(): boolean {
    return this._level === PriorityLevel.URGENT;
  }

  /**
   * HIGH 이상의 우선순위인지 확인
   */
  isHighOrAbove(): boolean {
    return this.score >= Priority.HIGH.score;
  }

  /**
   * 동등성 비교
   */
  equals(other: Priority): boolean {
    return this._level === other._level;
  }

  /**
   * 문자열 변환
   */
  toString(): string {
    return this._level;
  }

  /**
   * JSON 직렬화
   */
  toJSON(): string {
    return this._level;
  }

  /**
   * 한글 라벨 반환
   */
  get label(): string {
    const labels: Record<PriorityLevel, string> = {
      [PriorityLevel.LOW]: '낮음',
      [PriorityLevel.MEDIUM]: '보통',
      [PriorityLevel.HIGH]: '높음',
      [PriorityLevel.URGENT]: '긴급',
    };

    return labels[this._level];
  }

  /**
   * CSS 색상 클래스 반환 (UI용)
   */
  get colorClass(): string {
    const colors: Record<PriorityLevel, string> = {
      [PriorityLevel.LOW]: 'text-gray-600',
      [PriorityLevel.MEDIUM]: 'text-blue-600',
      [PriorityLevel.HIGH]: 'text-orange-600',
      [PriorityLevel.URGENT]: 'text-red-600',
    };

    return colors[this._level];
  }
}
