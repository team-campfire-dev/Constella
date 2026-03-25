import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// Mock next-auth providers and adapter to avoid side effects during import
vi.mock('@next-auth/prisma-adapter', () => ({
    PrismaAdapter: vi.fn(() => ({})),
}));

vi.mock('next-auth/providers/google', () => ({
    default: vi.fn(() => ({ id: 'google', name: 'Google', type: 'oauth' })),
}));

vi.mock('next-auth/providers/credentials', () => ({
    default: vi.fn((config: { authorize: unknown }) => ({
        id: 'credentials',
        name: 'Credentials',
        type: 'credentials',
        authorize: config.authorize,
    })),
}));

// Now import authOptions — providers/adapter are safely mocked
import { authOptions } from './auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthorizeFunction = (credentials: Record<string, string> | undefined, req: any) => Promise<any>;

// Extract the authorize function from CredentialsProvider
function getAuthorize(): AuthorizeFunction {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const credentialsProvider = authOptions.providers.find((p: any) => p.id === 'credentials') as any;
    return credentialsProvider.authorize;
}

// Replicate safeCompare from auth.ts for verification
function safeCompare(a: string, b: string): boolean {
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
}

describe('CredentialsProvider authorize', () => {
    const authorize = getAuthorize();

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.AGENT_EMAIL = 'agent@test.local';
        process.env.AGENT_PASSWORD = 'constella-agent';
    });

    it('safeCompare 유틸: 같은 문자열은 true 반환', () => {
        expect(safeCompare('test', 'test')).toBe(true);
        expect(safeCompare('test', 'other')).toBe(false);
    });

    it('bcrypt 해싱된 비밀번호로 DB 사용자 로그인 성공', async () => {
        const mockUser = {
            id: 'user-1',
            name: 'Test User',
            email: 'user@example.com',
            password: 'hashed_mypassword', // bcrypt mock: hash('mypassword') => 'hashed_mypassword'
        };
        vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);

        const result = await authorize(
            { username: 'user@example.com', password: 'mypassword' },
            {},
        );

        expect(result).toEqual(mockUser);
        expect(prisma.user.findUnique).toHaveBeenCalledWith({
            where: { email: 'user@example.com' },
        });
        expect(bcrypt.compare).toHaveBeenCalledWith('mypassword', 'hashed_mypassword');
    });

    it('잘못된 비밀번호로 로그인 실패', async () => {
        const mockUser = {
            id: 'user-1',
            name: 'Test User',
            email: 'user@example.com',
            password: 'hashed_correct_password',
        };
        vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);

        const result = await authorize(
            { username: 'user@example.com', password: 'wrong_password' },
            {},
        );

        expect(result).toBeNull();
    });

    it('존재하지 않는 이메일로 로그인 실패', async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

        const result = await authorize(
            { username: 'nobody@example.com', password: 'password' },
            {},
        );

        expect(result).toBeNull();
    });

    it('credentials 미제공 시 null 반환', async () => {
        const result = await authorize(undefined, {});

        expect(result).toBeNull();
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('Agent 계정 로그인 성공', async () => {
        const agentUser = {
            id: 'agent-1',
            name: 'Agent',
            email: 'agent@test.local',
        };
        vi.mocked(prisma.user.findUnique).mockResolvedValue(agentUser as never);

        const result = await authorize(
            { username: 'agent@test.local', password: 'constella-agent' },
            {},
        );

        expect(result).toEqual(agentUser);
        expect(prisma.user.findUnique).toHaveBeenCalledWith({
            where: { email: 'agent@test.local' },
        });
    });

    it('비밀번호가 없는 사용자(OAuth 전용)는 credential 로그인 실패', async () => {
        const oauthUser = {
            id: 'user-oauth',
            name: 'OAuth User',
            email: 'oauth@example.com',
            password: null,
        };
        vi.mocked(prisma.user.findUnique).mockResolvedValue(oauthUser as never);

        const result = await authorize(
            { username: 'oauth@example.com', password: 'some_password' },
            {},
        );

        expect(result).toBeNull();
    });
});
