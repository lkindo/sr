'use client';

/**
 * 최후의 에러 경계 (감사 4.4).
 *
 * `error.tsx` 들은 **자기 세그먼트의 레이아웃 안에서** 렌더링되므로, 루트 레이아웃이나
 * `ClientLayout` 의 프로바이더 트리 자체가 throw 하면 아무것도 잡지 못한다. 그때
 * `global-error.tsx` 가 없으면 Next 의 기본 무스타일 에러 페이지가 나온다.
 *
 * 이 컴포넌트는 루트 레이아웃을 **대체**하므로 `<html>` 과 `<body>` 를 직접 렌더링해야
 * 한다(Next.js 요구사항). 같은 이유로 프로바이더·폰트·전역 CSS 를 기대할 수 없으니,
 * 스타일은 인라인으로 두고 외부 컴포넌트를 import 하지 않는다 —
 * 그 import 가 바로 지금 깨진 것일 수 있다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#ffffff',
          color: '#18181b',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          시스템 오류가 발생했습니다
        </h1>
        <p style={{ margin: 0, color: '#71717a' }}>
          페이지를 표시할 수 없습니다. 잠시 후 다시 시도해주세요.
        </p>
        {error.digest && (
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#a1a1aa' }}>
            오류 코드: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            border: 'none',
            backgroundColor: '#2a3053',
            color: '#ffffff',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
