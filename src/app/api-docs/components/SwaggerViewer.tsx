'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

// Swagger UI를 dynamic import로 로드 (SSR 비활성화)
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-700 text-lg">API 문서 로딩 중...</p>
      </div>
    </div>
  ),
});

/**
 * Swagger UI 뷰어 컴포넌트
 *
 * swagger-ui-react 패키지를 사용하여 API 문서를 표시합니다.
 */
export function SwaggerViewer() {
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
          <h2 className="text-2xl font-bold text-red-600 mb-4">오류 발생</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
          >
            페이지 새로고침
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <SwaggerUI
        url="/api/docs"
        deepLinking={true}
        docExpansion="list"
        defaultModelsExpandDepth={1}
        defaultModelExpandDepth={1}
        filter={true}
        showExtensions={true}
        showCommonExtensions={true}
        tryItOutEnabled={true}
        persistAuthorization={true}
        onComplete={() => {
          console.log('Swagger UI 로드 완료');
        }}
      />
    </div>
  );
}
