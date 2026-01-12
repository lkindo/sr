import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, withAuthAndRateLimit, AuthenticatedContext } from './auth-wrapper';
import { apiResponse } from './api-response';
import { validateRequestBody, RouteContext } from './api-helpers';
import { NotFoundError, ForbiddenError } from './errors';

/**
 * CRUD 핸들러 설정 인터페이스
 */
export interface CRUDConfig<TService> {
  /**
   * 서비스 인스턴스 팩토리 함수
   */
  getService: () => TService;

  /**
   * 리소스 이름 (에러 메시지용)
   * @example "고객사", "사용자", "SR"
   */
  resourceName: string;

  /**
   * 권한 설정
   */
  permissions?: {
    read?: string;
    create?: string;
    update?: string;
    delete?: string;
  };

  /**
   * Zod 검증 스키마
   */
  schemas?: {
    create?: z.ZodSchema;
    update?: z.ZodSchema;
  };

  /**
   * Rate Limiting 설정
   */
  rateLimit?: {
    get?: 'strict' | 'standard' | 'relaxed';
    post?: 'strict' | 'standard' | 'relaxed';
    patch?: 'strict' | 'standard' | 'relaxed';
    delete?: 'strict' | 'standard' | 'relaxed';
  };
}

/**
 * 서비스 메서드 타입 (공통 CRUD 인터페이스)
 */
export interface CRUDService<T, TCreateInput, TUpdateInput> {
  findById?: (id: string, userId?: string) => Promise<T | null>;
  getAll?: (userId?: string) => Promise<T[]>;
  create?: (data: TCreateInput, user: any) => Promise<T>;
  update?: (id: string, data: TUpdateInput, user: any) => Promise<T>;
  delete?: (id: string, user: any) => Promise<T>;
}

/**
 * 권한 체크 함수
 *
 * @param userId - 사용자 ID
 * @param permission - 체크할 권한
 * @throws {ForbiddenError} 권한이 없는 경우
 */
async function checkPermission(userId: string, permission?: string): Promise<void> {
  if (!permission) return; // 권한 체크 불필요

  const { PermissionService } = await import('@/services/permission.service');
  const permissionService = new PermissionService();
  const hasPermission = await permissionService.checkPermission(userId, permission);

  if (!hasPermission) {
    throw new ForbiddenError(`${permission} 권한이 필요합니다.`);
  }
}

/**
 * CRUD API 핸들러 팩토리
 *
 * 공통 CRUD 패턴을 위한 API 핸들러를 자동 생성합니다.
 *
 * @param config - CRUD 설정
 * @returns Next.js API Route 핸들러 객체 { GET, POST, PATCH, DELETE }
 *
 * @example
 * ```typescript
 * // src/app/api/clients/[id]/route.ts
 * import { createCRUDHandler } from '@/lib/api-factory';
 * import { ClientService } from '@/services/client.service';
 * import { clientUpdateSchema } from '@/lib/schemas';
 * import { PERMISSIONS } from '@/lib/permissions';
 *
 * export const { GET, PATCH, DELETE } = createCRUDHandler({
 *   getService: () => ClientService.getInstance(),
 *   resourceName: '고객사',
 *   permissions: {
 *     read: PERMISSIONS.CLIENT.READ,
 *     update: PERMISSIONS.CLIENT.UPDATE,
 *     delete: PERMISSIONS.CLIENT.DELETE,
 *   },
 *   schemas: {
 *     update: clientUpdateSchema,
 *   },
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createCRUDHandler<
  TService extends CRUDService<any, any, any>,
  _T = any,
  _TCreateInput = any,
  TUpdateInput = any
>(config: CRUDConfig<TService>) {
  const {
    getService,
    resourceName,
    permissions = {},
    schemas = {},
    rateLimit = {
      get: 'relaxed',
      post: 'standard',
      patch: 'standard',
      delete: 'standard',
    },
  } = config;

  /**
   * GET /api/resource/[id] - 단건 조회
   */
  const GET = withAuth(async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 권한 체크
    if (permissions.read) {
      await checkPermission(session.user.id, permissions.read);
    }

    const service = getService();
    if (!service.findById) {
      return apiResponse.error('이 리소스는 조회를 지원하지 않습니다.', 405);
    }

    const item = await service.findById(id, session.user.id);

    if (!item) {
      throw new NotFoundError(`${resourceName}을(를) 찾을 수 없습니다.`);
    }

    return apiResponse.success(item);
  });

  /**
   * PATCH /api/resource/[id] - 수정
   */
  const PATCH = withAuthAndRateLimit(async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 권한 체크
    if (permissions.update) {
      await checkPermission(session.user.id, permissions.update);
    }

    const service = getService();
    if (!service.update) {
      return apiResponse.error('이 리소스는 수정을 지원하지 않습니다.', 405);
    }

    // 입력 검증
    let validated: TUpdateInput;
    if (schemas.update) {
      validated = await validateRequestBody(request, schemas.update as z.ZodSchema<TUpdateInput>);
    } else {
      validated = (await request.json()) as TUpdateInput;
    }

    const updated = await service.update(id, validated, session.user);

    return apiResponse.success(updated, 200, `${resourceName}이(가) 수정되었습니다.`);
  }, { preset: rateLimit.patch });

  /**
   * DELETE /api/resource/[id] - 삭제
   */
  const DELETE = withAuth(async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 권한 체크
    if (permissions.delete) {
      await checkPermission(session.user.id, permissions.delete);
    }

    const service = getService();
    if (!service.delete) {
      return apiResponse.error('이 리소스는 삭제를 지원하지 않습니다.', 405);
    }

    await service.delete(id, session.user);

    return apiResponse.success(
      { deleted: true },
      200,
      `${resourceName}이(가) 삭제되었습니다.`
    );
  });

  return { GET, PATCH, DELETE };
}

/**
 * 목록 조회 핸들러 생성
 *
 * @param config - CRUD 설정
 * @returns GET 핸들러
 *
 * @example
 * ```typescript
 * // src/app/api/clients/route.ts
 * export const GET = createListHandler({
 *   getService: () => ClientService.getInstance(),
 *   resourceName: '고객사',
 *   permissions: { read: PERMISSIONS.CLIENT.READ },
 * });
 * ```
 */
export function createListHandler<TService extends CRUDService<any, any, any>>(
  config: CRUDConfig<TService>
) {
  const { getService, permissions = {}, rateLimit = { get: 'relaxed' } } = config;

  return withAuth(async (
    request: NextRequest,
    { session }: AuthenticatedContext
  ) => {
    // 권한 체크
    if (permissions.read) {
      await checkPermission(session.user.id, permissions.read);
    }

    const service = getService();
    if (!service.getAll) {
      return apiResponse.error('이 리소스는 목록 조회를 지원하지 않습니다.', 405);
    }

    const items = await service.getAll(session.user.id);

    return apiResponse.success(items);
  });
}

/**
 * 생성 핸들러 생성
 *
 * @param config - CRUD 설정
 * @returns POST 핸들러
 *
 * @example
 * ```typescript
 * // src/app/api/clients/route.ts
 * export const POST = createCreateHandler({
 *   getService: () => ClientService.getInstance(),
 *   resourceName: '고객사',
 *   permissions: { create: PERMISSIONS.CLIENT.CREATE },
 *   schemas: { create: clientCreateSchema },
 * });
 * ```
 */
export function createCreateHandler<TService extends CRUDService<any, any, any>>(
  config: CRUDConfig<TService>
) {
  const {
    getService,
    resourceName,
    permissions = {},
    schemas = {},
    rateLimit = { post: 'standard' },
  } = config;

  return withAuthAndRateLimit(async (
    request: NextRequest,
    { session }: AuthenticatedContext
  ) => {
    // 권한 체크
    if (permissions.create) {
      await checkPermission(session.user.id, permissions.create);
    }

    const service = getService();
    if (!service.create) {
      return apiResponse.error('이 리소스는 생성을 지원하지 않습니다.', 405);
    }

    // 입력 검증
    let validated: any;
    if (schemas.create) {
      validated = await validateRequestBody(request, schemas.create);
    } else {
      validated = await request.json();
    }

    const created = await service.create(validated, session.user);

    return apiResponse.success(created, 201, `${resourceName}이(가) 생성되었습니다.`);
  }, { preset: rateLimit.post });
}
