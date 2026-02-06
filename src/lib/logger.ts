/* eslint-disable no-console */
/**
 * 구조화된 로깅 시스템
 * 프로덕션 환경에서 에러 트래킹 서비스(Sentry 등) 연동 가능
 */

import pino from 'pino';

import { ServiceError } from './errors';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
  userId?: string;
  srId?: string;
  clientId?: string;
  requestId?: string;
  [key: `custom_${string}`]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    statusCode?: number;
  };
}

class Logger {
  private isBrowser = typeof window !== 'undefined';
  private isEdge = process.env.NEXT_RUNTIME === 'edge';
  private isProduction = process.env.NODE_ENV === 'production';
  private isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

  private pinoLogger: ReturnType<typeof pino> | null = null;

  constructor() {
    this.initPino();
  }

  /**
   * 런타임 환경에 맞게 Pino 로거 초기화
   * 브라우저나 Edge 환경에서 Node.js 전용 API 호출로 인한 크래시 방지
   */
  private initPino(): void {
    if (!this.isProduction || this.isEdge || this.isBrowser) {
      return;
    }

    try {
      // pino.destination이 존재하고 함수인지 확인 (Node.js 환경 검증)
      if (typeof pino.destination === 'function') {
        this.pinoLogger = pino(
          {
            timestamp: false,
            messageKey: 'message',
            formatters: {
              level: (label: string) => ({ level: label }),
            },
            base: undefined,
          },
          pino.destination({ sync: false, minLength: 4096 })
        );
      } else {
        // pino.destination이 없는 경우 기본 출력 사용
        this.pinoLogger = pino({
          timestamp: false,
          messageKey: 'message',
          base: undefined,
        });
      }
    } catch (error) {
      // 초기화 실패 시 null 유지 (output 메서드에서 console로 fallback 처리됨)
      console.error('[Logger] Failed to initialize Pino, falling back to console:', error);
      this.pinoLogger = null;
    }
  }

  /**
   * 로그 레벨에 따라 출력 여부 결정
   */
  private shouldLog(level: LogLevel): boolean {
    if (this.isDevelopment) {
      return true; // 개발 환경에서는 모든 로그 출력
    }

    // 프로덕션 환경에서는 error와 warn만 출력
    return level === 'error' || level === 'warn';
  }

  /**
   * 구조화된 로그 엔트리 생성
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error | ServiceError
  ): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };

      // ServiceError인 경우 추가 정보 포함
      if (error instanceof ServiceError) {
        entry.error.code = error.code;
        entry.error.statusCode = error.statusCode;
      }
    }

    return entry;
  }

  /**
   * 로그 출력 (환경에 따라 포맷 변경)
   */
  private output(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    if (this.isProduction && this.pinoLogger) {
      // 프로덕션: Pino 사용 (비동기 로깅으로 이벤트 루프 블로킹 방지)
      const { level, ...logData } = entry;
      this.pinoLogger[level](logData);
    } else {
      // 개발 환경: 가독성 좋은 형식으로 출력
      const prefix = `[${entry.level.toUpperCase()}]`;
      const time = new Date(entry.timestamp).toLocaleTimeString();

      if (entry.error) {
        console.error(`${prefix} [${time}] ${entry.message}`, entry.error, entry.context || {});
      } else {
        const logMethod =
          entry.level === 'error'
            ? console.error
            : entry.level === 'warn'
              ? console.warn
              : entry.level === 'info'
                ? console.info
                : console.log;
        logMethod(`${prefix} [${time}] ${entry.message}`, entry.context || {});
      }
    }
  }

  /**
   * Debug 레벨 로그 (개발 환경에서만)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      this.output(this.createLogEntry('debug', message, context));
    }
  }

  /**
   * Info 레벨 로그
   */
  info(message: string, context?: LogContext): void {
    this.output(this.createLogEntry('info', message, context));
  }

  /**
   * Warning 레벨 로그
   */
  warn(message: string, context?: LogContext): void {
    this.output(this.createLogEntry('warn', message, context));
  }

  /**
   * Error 레벨 로그
   */
  error(message: string, error?: Error | ServiceError, context?: LogContext): void {
    this.output(this.createLogEntry('error', message, context, error));
  }

  /**
   * ServiceError 전용 로깅 (에러 정보 자동 추출)
   */
  logError(error: ServiceError, context?: LogContext): void {
    this.error(error.message, error, context);
  }

  /**
   * API 요청 로깅
   */
  logRequest(
    method: string,
    path: string,
    statusCode: number,
    duration?: number,
    context?: LogContext
  ): void {
    const message = `${method} ${path} - ${statusCode}${duration ? ` (${duration}ms)` : ''}`;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    this.output(
      this.createLogEntry(level, message, {
        ...context,
        custom_method: method,
        custom_path: path,
        custom_statusCode: statusCode,
        custom_duration: duration,
      })
    );
  }
}

// 싱글톤 인스턴스
export const logger = new Logger();
