import { SwaggerViewer } from './components/SwaggerViewer';

/**
 * API 문서 페이지
 *
 * Swagger UI를 사용하여 대화형 API 문서를 제공합니다.
 * - 로컬에서 바로 API 테스트 가능
 * - OpenAPI 3.0 스펙 기반
 * - 모든 엔드포인트 문서화
 */
export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <SwaggerViewer />
    </div>
  );
}
