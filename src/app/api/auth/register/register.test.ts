import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@/lib/prisma';
import prismaContent from '@/lib/prisma-content';

// Must import after mocks are set up (via setup.ts)
const { POST } = await import('./route');

describe('POST /api/auth/register', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    let requestCounter = 0;

    function makeRequest(body: Record<string, unknown>) {
        requestCounter++;
        return new Request('http://localhost/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Mock a uniquely incrementing x-forwarded-for header for each request
                // to prevent test failures due to rate limiting
                'x-forwarded-for': `192.168.1.${requestCounter}`
            },
            body: JSON.stringify(body),
        });
    }

    it('정상 회원가입 — 사용자 생성 및 Content DB 동기화', async () => {
        const mockUser = { id: 'user-123', name: 'Test', email: 'test@example.com' };

        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.user.create).mockResolvedValue(mockUser as never);
        vi.mocked(prismaContent.user.upsert).mockResolvedValue({ id: 'user-123' } as never);

        const res = await POST(makeRequest({
            name: 'Test',
            email: 'test@example.com',
            password: 'password123',
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.user.email).toBe('test@example.com');

        // Main DB에 사용자 생성 확인
        expect(prisma.user.create).toHaveBeenCalledWith({
            data: {
                name: 'Test',
                email: 'test@example.com',
                password: 'hashed_password123', // bcrypt mock이 prefix 추가
            },
        });

        // Content DB 동기화 확인
        expect(prismaContent.user.upsert).toHaveBeenCalledWith({
            where: { id: 'user-123' },
            update: {},
            create: { id: 'user-123' },
        });
    });

    it('이메일 누락 시 400 반환', async () => {
        const res = await POST(makeRequest({ password: 'password123' }));
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toBe('Missing email or password');
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('비밀번호 누락 시 400 반환', async () => {
        const res = await POST(makeRequest({ email: 'test@example.com' }));
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toBe('Missing email or password');
    });

    it('이미 존재하는 이메일로 가입 시 400 반환', async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'existing-user',
            email: 'test@example.com',
        } as never);

        const res = await POST(makeRequest({
            name: 'Test',
            email: 'test@example.com',
            password: 'password123',
        }));
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toBe('User already exists');
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('내부 에러 발생 시 500 반환', async () => {
        vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('DB connection failed'));

        const res = await POST(makeRequest({
            name: 'Test',
            email: 'test@example.com',
            password: 'password123',
        }));
        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data.error).toBe('Internal server error');
    });
});
