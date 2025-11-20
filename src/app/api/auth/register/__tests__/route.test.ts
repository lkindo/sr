import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
    hash: vi.fn().mockResolvedValue('hashed_password_123'),
}));

// Mock prisma
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
    default: {
        user: {
            findUnique: mockFindUnique,
            create: mockCreate,
        },
    },
}));

describe('POST /api/auth/register', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('유효한 데이터로 회원가입에 성공해야 함', async () => {
        // Arrange
        const userData = {
            name: 'Test User',
            email: 'test@example.com',
            password: 'password123',
        };

        const createdUser = {
            id: 'user123',
            name: userData.name,
            email: userData.email,
            createdAt: new Date('2024-11-20T00:00:00Z'),
        };

        mockFindUnique.mockResolvedValue(null); // 이메일 중복 없음
        mockCreate.mockResolvedValue(createdUser);

        const request = new Request('http://localhost/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        }) as NextRequest;

        const { POST } = await import('../route');

        // Act
        const response = await POST(request);
        const json = await response.json();

        // Assert
        expect(response.status).toBe(201);
        expect(json.message).toBe('회원가입이 성공적으로 완료되었습니다.');
        expect(json.user).toHaveProperty('id');
        expect(json.user).toHaveProperty('name', userData.name);
        expect(json.user).toHaveProperty('email', userData.email);
        expect(json.user).not.toHaveProperty('password'); // 비밀번호는 응답에 포함되지 않아야 함
    });

    it('이메일이 중복되면 400 에러를 반환해야 함', async () => {
        // Arrange
        const userData = {
            name: 'Test User',
            email: 'existing@example.com',
            password: 'password123',
        };

        mockFindUnique.mockResolvedValue({ id: 'existing-user', email: userData.email });

        const request = new Request('http://localhost/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        }) as NextRequest;

        const { POST } = await import('../route');

        // Act
        const response = await POST(request);
        const json = await response.json();

        // Assert
        expect(response.status).toBe(400);
        expect(json.error).toBe('이미 존재하는 이메일입니다.');
    });

    it('이름이 2자 미만이면 검증 에러를 반환해야 함', async () => {
        // Arrange
        const userData = {
            name: 'A', // 1자
            email: 'test@example.com',
            password: 'password123',
        };

        const request = new Request('http://localhost/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        }) as NextRequest;

        const { POST } = await import('../route');

        // Act
        const response = await POST(request);
        const json = await response.json();

        // Assert
        expect(response.status).toBe(400);
        expect(json.error).toContain('이름은 최소 2자 이상이어야 합니다');
    });

    it('이메일 형식이 잘못되면 검증 에러를 반환해야 함', async () => {
        // Arrange
        const userData = {
            name: 'Test User',
            email: 'invalid-email', // 잘못된 이메일 형식
            password: 'password123',
        };

        const request = new Request('http://localhost/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        }) as NextRequest;

        const { POST } = await import('../route');

        // Act
        const response = await POST(request);
        const json = await response.json();

        // Assert
        expect(response.status).toBe(400);
        expect(json.error).toContain('유효한 이메일 주소를 입력해주세요');
    });

    it('비밀번호가 6자 미만이면 검증 에러를 반환해야 함', async () => {
        // Arrange
        const userData = {
            name: 'Test User',
            email: 'test@example.com',
            password: '12345', // 5자
        };

        const request = new Request('http://localhost/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        }) as NextRequest;

        const { POST } = await import('../route');

        // Act
        const response = await POST(request);
        const json = await response.json();

        // Assert
        expect(response.status).toBe(400);
        expect(json.error).toContain('비밀번호는 최소 6자 이상이어야 합니다');
    });

    it('필수 필드가 누락되면 검증 에러를 반환해야 함', async () => {
        // Arrange
        const userData = {
            name: 'Test User',
            // email 누락
            password: 'password123',
        };

        const request = new Request('http://localhost/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        }) as NextRequest;

        const { POST } = await import('../route');

        // Act
        const response = await POST(request);
        const json = await response.json();

        // Assert
        expect(response.status).toBe(400);
        expect(json.error).toBeDefined();
    });

    it('데이터베이스 연결 오류 시 500 에러를 반환해야 함', async () => {
        // Arrange
        const userData = {
            name: 'Test User',
            email: 'test@example.com',
            password: 'password123',
        };

        mockFindUnique.mockRejectedValue(new Error('database connection failed'));

        const request = new Request('http://localhost/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        }) as NextRequest;

        const { POST } = await import('../route');

        // Act
        const response = await POST(request);
        const json = await response.json();

        // Assert
        expect(response.status).toBe(500);
        expect(json.error).toContain('데이터베이스 연결에 실패했습니다');
    });

    it('예상치 못한 에러 시 500 에러를 반환해야 함', async () => {
        // Arrange
        const userData = {
            name: 'Test User',
            email: 'test@example.com',
            password: 'password123',
        };

        mockFindUnique.mockRejectedValue(new Error('Unexpected error'));

        const request = new Request('http://localhost/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        }) as NextRequest;

        const { POST } = await import('../route');

        // Act
        const response = await POST(request);
        const json = await response.json();

        // Assert
        expect(response.status).toBe(500);
        expect(json.error).toBe('회원가입 처리 중 오류가 발생했습니다.');
    });

    it('비밀번호가 해싱되어 저장되어야 함', async () => {
        // Arrange
        const userData = {
            name: 'Test User',
            email: 'test@example.com',
            password: 'password123',
        };

        const createdUser = {
            id: 'user123',
            name: userData.name,
            email: userData.email,
            createdAt: new Date(),
        };

        mockFindUnique.mockResolvedValue(null);
        mockCreate.mockResolvedValue(createdUser);

        const request = new Request('http://localhost/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        }) as NextRequest;

        const { POST } = await import('../route');
        const { hash } = await import('bcryptjs');

        // Act
        await POST(request);

        // Assert
        expect(hash).toHaveBeenCalledWith(userData.password, 10);
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    password: 'hashed_password_123',
                }),
            })
        );
    });
});
