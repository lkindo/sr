import { describe, it, expect } from 'vitest'
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  serverErrorResponse,
  paginatedResponse,
} from '../api-response'

describe('api-response', () => {
  describe('successResponse', () => {
    it('성공 응답을 올바르게 생성', async () => {
      const data = { id: '1', name: 'Test' }
      const response = successResponse(data, 200, 'Success')
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json).toEqual({
        data,
        message: 'Success',
      })
    })

    it('메시지 없이 성공 응답 생성', async () => {
      const data = { id: '1' }
      const response = successResponse(data)
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.data).toEqual(data)
      expect(json.message).toBeUndefined()
    })

    it('상태 코드 커스터마이징', async () => {
      const data = { id: '1' }
      const response = successResponse(data, 201, 'Created')
      
      expect(response.status).toBe(201)
    })
  })

  describe('errorResponse', () => {
    it('에러 응답을 올바르게 생성', async () => {
      const response = errorResponse('Error message', 400, 'CUSTOM_ERROR', { field: 'test' })
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json).toEqual({
        error: 'Error message',
        code: 'CUSTOM_ERROR',
        details: { field: 'test' },
      })
    })

    it('기본 상태 코드 500 사용', async () => {
      const response = errorResponse('Error')
      const json = await response.json()

      expect(response.status).toBe(500)
      expect(json.error).toBe('Error')
    })

    it('code와 details 없이 에러 생성', async () => {
      const response = errorResponse('Simple error', 400)
      const json = await response.json()

      expect(json.code).toBeUndefined()
      expect(json.details).toBeUndefined()
    })
  })

  describe('validationErrorResponse', () => {
    it('유효성 검증 에러를 올바르게 생성', async () => {
      const errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ]

      const response = validationErrorResponse(errors)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toBe('유효성 검사 실패')
      expect(json.code).toBe('VALIDATION_ERROR')
      expect(json.details).toEqual(errors)
    })
  })

  describe('unauthorizedResponse', () => {
    it('커스텀 메시지로 401 응답 생성', async () => {
      const response = unauthorizedResponse('Custom unauthorized')
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json).toEqual({
        error: 'Custom unauthorized',
        code: 'UNAUTHORIZED',
      })
    })

    it('기본 메시지 사용', async () => {
      const response = unauthorizedResponse()
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.error).toBe('인증이 필요합니다.')
      expect(json.code).toBe('UNAUTHORIZED')
    })
  })

  describe('forbiddenResponse', () => {
    it('커스텀 메시지로 403 응답 생성', async () => {
      const response = forbiddenResponse('No permission')
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json).toEqual({
        error: 'No permission',
        code: 'FORBIDDEN',
      })
    })

    it('기본 메시지 사용', async () => {
      const response = forbiddenResponse()
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.error).toBe('권한이 없습니다.')
      expect(json.code).toBe('FORBIDDEN')
    })
  })

  describe('notFoundResponse', () => {
    it('리소스 이름과 함께 404 응답 생성', async () => {
      const response = notFoundResponse('User')
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json).toEqual({
        error: 'User을(를) 찾을 수 없습니다.',
        code: 'NOT_FOUND',
      })
    })

    it('기본 리소스 이름 사용', async () => {
      const response = notFoundResponse()
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.error).toBe('리소스을(를) 찾을 수 없습니다.')
      expect(json.code).toBe('NOT_FOUND')
    })
  })

  describe('serverErrorResponse', () => {
    it('서버 에러 응답 생성', async () => {
      const response = serverErrorResponse('Custom error', new Error('test'))
      const json = await response.json()

      expect(response.status).toBe(500)
      expect(json).toEqual({
        error: 'Custom error',
        code: 'SERVER_ERROR',
      })
    })

    it('기본 메시지 사용', async () => {
      const response = serverErrorResponse()
      const json = await response.json()

      expect(response.status).toBe(500)
      expect(json.error).toBe('서버 오류가 발생했습니다.')
      expect(json.code).toBe('SERVER_ERROR')
    })
  })

  describe('paginatedResponse', () => {
    it('페이지네이션 응답을 올바르게 생성', async () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }]
      const response = paginatedResponse(data, 1, 10, 25)
      const json = await response.json()

      expect(json).toEqual({
        data,
        meta: {
          page: 1,
          limit: 10,
          total: 25,
          totalPages: 3,
          hasNext: true,
          hasPrev: false,
        },
      })
    })

    it('마지막 페이지 계산', async () => {
      const data = [{ id: 21 }, { id: 22 }]
      const response = paginatedResponse(data, 3, 10, 22)
      const json = await response.json()

      expect(json.meta).toEqual({
        page: 3,
        limit: 10,
        total: 22,
        totalPages: 3,
        hasNext: false,
        hasPrev: true,
      })
    })

    it('첫 페이지와 마지막 페이지가 같을 때', async () => {
      const data = [{ id: 1 }, { id: 2 }]
      const response = paginatedResponse(data, 1, 10, 2)
      const json = await response.json()

      expect(json.meta).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      })
    })
  })
})
