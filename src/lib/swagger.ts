/**
 * Swagger API 문서 스펙 생성
 *
 * OpenAPI 3.0 스펙을 기반으로 SR 관리 시스템의 모든 API 엔드포인트를 문서화합니다.
 *
 * @returns OpenAPI 3.0 스펙 객체
 */
export const getApiDocs = () => {
  return {
    openapi: '3.0.0',
    info: {
      title: 'SR Management System API',
      version: '1.0.0',
      description: `
# SR 관리 시스템 API 문서

## 개요
SR(Service Request) 관리 시스템의 RESTful API 문서입니다.

## 인증
모든 API는 NextAuth.js 기반의 JWT 인증을 사용합니다.
- 로그인: NextAuth.js 제공
- 세션 쿠키를 통한 자동 인증

## 권한 시스템
역할 기반 접근 제어(RBAC)를 사용합니다:
- **ADMIN**: 시스템 전체 관리
- **MANAGER**: SR 접수 및 할당
- **ENGINEER**: SR 처리
- **CLIENT_USER**: SR 생성 및 조회

## Rate Limiting
API 요청 제한:
- \`strict\`: 60 req/min (인증 API)
- \`standard\`: 100 req/min (일반 POST/PUT)
- \`relaxed\`: 300 req/min (GET)
- \`fileUpload\`: 20 req/min (파일 업로드)
      `,
      contact: {
        name: 'SR Management Team',
        email: 'support@sr-management.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: '개발 서버',
      },
      {
        url: 'https://sr-management.vercel.app',
        description: '프로덕션 서버',
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'authjs.session-token',
          description: 'NextAuth.js 세션 쿠키',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                code: { type: 'string' },
                details: { type: 'object' },
              },
            },
          },
        },
        SR: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            srNumber: { type: 'string', example: 'SR-20251121-0001' },
            title: { type: 'string', example: '로그인 오류 수정' },
            description: { type: 'string' },
            status: {
              type: 'string',
              enum: ['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CONFIRMED', 'REJECTED'],
            },
            priority: {
              type: 'string',
              enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
            },
            clientId: { type: 'string', format: 'uuid' },
            requesterId: { type: 'string', format: 'uuid' },
            assigneeId: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Client: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string', example: 'ACME' },
            name: { type: 'string', example: 'Acme Corporation' },
            industry: { type: 'string', example: 'IT' },
            contactPerson: { type: 'string' },
            contactEmail: { type: 'string', format: 'email' },
            contactPhone: { type: 'string' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            isActive: { type: 'boolean', example: true },
            roles: {
              type: 'array',
              items: { type: 'string' },
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [{ cookieAuth: [] }],
    tags: [
      { name: 'SRs', description: 'SR(Service Request) 관리 API' },
      { name: 'Clients', description: '고객사 관리 API' },
      { name: 'Users', description: '사용자 관리 API' },
      { name: 'Dashboard', description: '대시보드 API' },
    ],
    paths: {
      '/api/srs': {
        get: {
          tags: ['SRs'],
          summary: 'SR 목록 조회',
          description: '현재 사용자가 접근 가능한 SR 목록을 조회합니다.',
          parameters: [
            {
              in: 'query',
              name: 'status',
              schema: { type: 'string', enum: ['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CONFIRMED', 'REJECTED'] },
              description: 'SR 상태 필터',
            },
            {
              in: 'query',
              name: 'priority',
              schema: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
              description: 'SR 우선순위 필터',
            },
          ],
          responses: {
            '200': {
              description: 'SR 목록 조회 성공',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/SR' },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '401': { description: '인증 실패' },
          },
        },
        post: {
          tags: ['SRs'],
          summary: 'SR 생성',
          description: '새로운 SR을 생성합니다.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'description', 'clientId', 'serviceCategoryId'],
                  properties: {
                    title: { type: 'string', example: '로그인 오류 수정' },
                    description: { type: 'string', example: '로그인 시 500 에러 발생' },
                    clientId: { type: 'string', format: 'uuid' },
                    serviceCategoryId: { type: 'string', format: 'uuid' },
                    requestedPriority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
                    requestedCompletionDate: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'SR 생성 성공',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: { $ref: '#/components/schemas/SR' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '400': { description: '입력값 검증 실패' },
            '401': { description: '인증 실패' },
          },
        },
      },
      '/api/srs/{id}': {
        get: {
          tags: ['SRs'],
          summary: 'SR 상세 조회',
          description: 'SR ID로 상세 정보를 조회합니다.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'SR ID',
            },
          ],
          responses: {
            '200': {
              description: 'SR 조회 성공',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: { $ref: '#/components/schemas/SR' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '401': { description: '인증 실패' },
            '404': { description: 'SR을 찾을 수 없음' },
          },
        },
        patch: {
          tags: ['SRs'],
          summary: 'SR 수정',
          description: 'SR 정보를 수정합니다.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'SR ID',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    status: { type: 'string', enum: ['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CONFIRMED', 'REJECTED'] },
                    priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'SR 수정 성공',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: { $ref: '#/components/schemas/SR' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '400': { description: '입력값 검증 실패' },
            '401': { description: '인증 실패' },
            '403': { description: '권한 없음' },
            '404': { description: 'SR을 찾을 수 없음' },
          },
        },
        delete: {
          tags: ['SRs'],
          summary: 'SR 삭제',
          description: 'SR을 삭제합니다.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'SR ID',
            },
          ],
          responses: {
            '200': { description: 'SR 삭제 성공' },
            '401': { description: '인증 실패' },
            '403': { description: '권한 없음' },
            '404': { description: 'SR을 찾을 수 없음' },
          },
        },
      },
      '/api/clients': {
        get: {
          tags: ['Clients'],
          summary: '고객사 목록 조회',
          description: '모든 고객사 목록을 조회합니다.',
          responses: {
            '200': {
              description: '고객사 목록 조회 성공',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Client' },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '401': { description: '인증 실패' },
          },
        },
        post: {
          tags: ['Clients'],
          summary: '고객사 생성',
          description: '새로운 고객사를 생성합니다.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['code', 'name'],
                  properties: {
                    code: { type: 'string', minLength: 2, example: 'ACME' },
                    name: { type: 'string', minLength: 1, example: 'Acme Corporation' },
                    industry: { type: 'string', example: 'IT' },
                    contactPerson: { type: 'string' },
                    contactEmail: { type: 'string', format: 'email' },
                    contactPhone: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: '고객사 생성 성공',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: { $ref: '#/components/schemas/Client' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '400': { description: '입력값 검증 실패' },
            '401': { description: '인증 실패' },
            '403': { description: '권한 없음' },
          },
        },
      },
      '/api/clients/{id}': {
        get: {
          tags: ['Clients'],
          summary: '고객사 상세 조회',
          description: '고객사 ID로 상세 정보를 조회합니다.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: '고객사 ID',
            },
          ],
          responses: {
            '200': {
              description: '고객사 조회 성공',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: { $ref: '#/components/schemas/Client' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '401': { description: '인증 실패' },
            '404': { description: '고객사를 찾을 수 없음' },
          },
        },
        patch: {
          tags: ['Clients'],
          summary: '고객사 수정',
          description: '고객사 정보를 수정합니다.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: '고객사 ID',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    name: { type: 'string' },
                    industry: { type: 'string' },
                    contactPerson: { type: 'string' },
                    contactEmail: { type: 'string', format: 'email' },
                    contactPhone: { type: 'string' },
                    isActive: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: '고객사 수정 성공',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: { $ref: '#/components/schemas/Client' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '400': { description: '입력값 검증 실패' },
            '401': { description: '인증 실패' },
            '403': { description: '권한 없음' },
            '404': { description: '고객사를 찾을 수 없음' },
          },
        },
        delete: {
          tags: ['Clients'],
          summary: '고객사 삭제',
          description: '고객사를 삭제합니다.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: '고객사 ID',
            },
          ],
          responses: {
            '200': { description: '고객사 삭제 성공' },
            '401': { description: '인증 실패' },
            '403': { description: '권한 없음' },
            '404': { description: '고객사를 찾을 수 없음' },
          },
        },
      },
      '/api/dashboard/stats': {
        get: {
          tags: ['Dashboard'],
          summary: '대시보드 통계',
          description: 'SR 관련 통계 정보를 조회합니다.',
          responses: {
            '200': {
              description: '통계 조회 성공',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      totalSRs: { type: 'number' },
                      byStatus: {
                        type: 'object',
                        additionalProperties: { type: 'number' },
                      },
                      byPriority: {
                        type: 'object',
                        additionalProperties: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: '인증 실패' },
          },
        },
      },
    },
  };
};
