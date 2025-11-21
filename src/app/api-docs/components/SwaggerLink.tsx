'use client';

import { useEffect, useState } from 'react';

/**
 * Swagger Editor 링크 컴포넌트
 *
 * 클라이언트 사이드에서 현재 origin을 가져와 Swagger Editor URL을 생성합니다.
 */
export function SwaggerLink() {
  const [swaggerUrl, setSwaggerUrl] = useState<string>('');

  useEffect(() => {
    const origin = window.location.origin;
    const url = `https://editor.swagger.io/?url=${encodeURIComponent(`${origin}/api/docs`)}`;
    setSwaggerUrl(url);
  }, []);

  if (!swaggerUrl) {
    return (
      <div className="inline-block bg-gray-400 text-white px-6 py-3 rounded-lg">
        로딩 중...
      </div>
    );
  }

  return (
    <a
      href={swaggerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition"
    >
      Swagger Editor 열기
    </a>
  );
}
