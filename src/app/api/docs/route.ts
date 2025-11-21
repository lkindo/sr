import { NextResponse } from 'next/server';
import { getApiDocs } from '@/lib/swagger';

/**
 * OpenAPI 스펙 JSON을 반환하는 API 엔드포인트
 *
 * Swagger UI에서 사용할 API 명세를 제공합니다.
 *
 * @returns OpenAPI 3.0 스펙 JSON
 */
export async function GET() {
  try {
    const spec = getApiDocs();

    return NextResponse.json(spec, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('API Docs 생성 중 오류:', error);
    return NextResponse.json(
      { error: 'API 문서를 생성하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
