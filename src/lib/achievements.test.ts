import { describe, it, expect, vi, beforeEach } from 'vitest';
import prismaContent from '@/lib/prisma-content';
import { ACHIEVEMENT_DEFINITIONS, checkAndGrantAchievements } from './achievements';

// Type helper for mocked functions
const mockedPrismaContent = vi.mocked(prismaContent, true);

describe('ACHIEVEMENT_DEFINITIONS', () => {
    it('모든 업적 타입에 3개의 티어가 존재', () => {
        for (const def of ACHIEVEMENT_DEFINITIONS) {
            expect(def.tiers).toHaveLength(3);
            expect(def.tiers.map(t => t.tier)).toEqual([1, 2, 3]);
        }
    });

    it('각 업적의 threshold가 오름차순', () => {
        for (const def of ACHIEVEMENT_DEFINITIONS) {
            for (let i = 1; i < def.tiers.length; i++) {
                expect(def.tiers[i].threshold).toBeGreaterThan(def.tiers[i - 1].threshold);
            }
        }
    });

    it('모든 업적에 en/ko 이름과 설명이 존재', () => {
        for (const def of ACHIEVEMENT_DEFINITIONS) {
            expect(def.name.en).toBeTruthy();
            expect(def.name.ko).toBeTruthy();
            expect(def.description.en).toBeTruthy();
            expect(def.description.ko).toBeTruthy();
            expect(def.icon).toBeTruthy();
        }
    });

    it('6개의 업적 타입이 정의됨', () => {
        expect(ACHIEVEMENT_DEFINITIONS).toHaveLength(6);
        const types = ACHIEVEMENT_DEFINITIONS.map(d => d.type);
        expect(types).toContain('first_contact');
        expect(types).toContain('pioneer');
        expect(types).toContain('cartographer');
        expect(types).toContain('social_butterfly');
        expect(types).toContain('constellation_maker');
        expect(types).toContain('deep_diver');
    });
});

describe('checkAndGrantAchievements', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('토픽 1개 발견 시 first_contact 티어1 부여', async () => {
        // Setup: 1 discovery, 0 chats, 0 comms
        mockedPrismaContent.shipLog.count.mockResolvedValue(1);
        mockedPrismaContent.chatHistory.count.mockResolvedValue(0);
        mockedPrismaContent.commsMessage.count.mockResolvedValue(0);

        // ShipLog details for pioneer check
        mockedPrismaContent.shipLog.findMany.mockResolvedValue([
            { id: '1', topicId: 'topic-1', discoveredAt: new Date(), userId: 'user-1' },
        ] as any);
        // This user was first discoverer (no earlier log)
        mockedPrismaContent.shipLog.findFirst.mockResolvedValue(null);

        // No existing achievements
        mockedPrismaContent.achievement.findMany.mockResolvedValue([]);
        mockedPrismaContent.achievement.create.mockResolvedValue({} as any);

        const result = await checkAndGrantAchievements('user-1');

        // Should grant first_contact:1 and pioneer:1
        expect(result).toEqual(
            expect.arrayContaining([
                { type: 'first_contact', tier: 1 },
                { type: 'pioneer', tier: 1 },
            ])
        );
    });

    it('이미 부여된 업적은 중복 부여하지 않음', async () => {
        mockedPrismaContent.shipLog.count.mockResolvedValue(1);
        mockedPrismaContent.chatHistory.count.mockResolvedValue(0);
        mockedPrismaContent.commsMessage.count.mockResolvedValue(0);
        mockedPrismaContent.shipLog.findMany.mockResolvedValue([
            { id: '1', topicId: 'topic-1', discoveredAt: new Date(), userId: 'user-1' },
        ] as any);
        mockedPrismaContent.shipLog.findFirst.mockResolvedValue(null);

        // Already granted first_contact:1
        mockedPrismaContent.achievement.findMany.mockResolvedValue([
            { type: 'first_contact', tier: 1 },
            { type: 'pioneer', tier: 1 },
        ] as any);

        const result = await checkAndGrantAchievements('user-1');

        // first_contact:1 should NOT be in newly granted
        expect(result.find(a => a.type === 'first_contact' && a.tier === 1)).toBeUndefined();
    });

    it('활동이 없으면 빈 배열 반환', async () => {
        mockedPrismaContent.shipLog.count.mockResolvedValue(0);
        mockedPrismaContent.chatHistory.count.mockResolvedValue(0);
        mockedPrismaContent.commsMessage.count.mockResolvedValue(0);
        mockedPrismaContent.shipLog.findMany.mockResolvedValue([]);
        mockedPrismaContent.achievement.findMany.mockResolvedValue([]);

        const result = await checkAndGrantAchievements('user-1');
        expect(result).toEqual([]);
    });

    it('에러 발생 시 빈 배열 반환 (에러 내성)', async () => {
        mockedPrismaContent.shipLog.count.mockRejectedValue(new Error('DB Error'));

        const result = await checkAndGrantAchievements('user-1');
        expect(result).toEqual([]);
    });

    it('채팅 10회 시 cartographer 티어1 부여', async () => {
        mockedPrismaContent.shipLog.count.mockResolvedValue(0);
        mockedPrismaContent.chatHistory.count.mockResolvedValue(10);
        mockedPrismaContent.commsMessage.count.mockResolvedValue(0);
        mockedPrismaContent.shipLog.findMany.mockResolvedValue([]);
        mockedPrismaContent.achievement.findMany.mockResolvedValue([]);
        mockedPrismaContent.achievement.create.mockResolvedValue({} as any);

        const result = await checkAndGrantAchievements('user-1');

        expect(result).toEqual(
            expect.arrayContaining([
                { type: 'cartographer', tier: 1 },
            ])
        );
    });

    it('Comms 메시지 50회 시 social_butterfly 티어2까지 부여', async () => {
        mockedPrismaContent.shipLog.count.mockResolvedValue(0);
        mockedPrismaContent.chatHistory.count.mockResolvedValue(0);
        mockedPrismaContent.commsMessage.count.mockResolvedValue(50);
        mockedPrismaContent.shipLog.findMany.mockResolvedValue([]);
        mockedPrismaContent.achievement.findMany.mockResolvedValue([]);
        mockedPrismaContent.achievement.create.mockResolvedValue({} as any);

        const result = await checkAndGrantAchievements('user-1');

        expect(result).toEqual(
            expect.arrayContaining([
                { type: 'social_butterfly', tier: 1 },
                { type: 'social_butterfly', tier: 2 },
            ])
        );
    });
});
