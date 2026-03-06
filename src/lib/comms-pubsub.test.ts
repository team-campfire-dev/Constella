import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

// We test comms-pubsub without the global mock since it's a simple EventEmitter wrapper
vi.doUnmock('@/lib/comms-pubsub');

describe('commsPubSub', () => {
    it('EventEmitter 인스턴스이다', async () => {
        const { default: commsPubSub } = await import('./comms-pubsub');
        expect(commsPubSub).toBeInstanceOf(EventEmitter);
    });

    it('이벤트를 emit/on으로 수신할 수 있다', async () => {
        const { default: commsPubSub } = await import('./comms-pubsub');

        const received: unknown[] = [];
        commsPubSub.on('test-event', (data: unknown) => {
            received.push(data);
        });

        const testData = {
            id: 'msg-1',
            content: 'Hello!',
            timestamp: new Date(),
            channel: 'global',
            user: { id: 'u1', name: 'Test User' },
        };

        commsPubSub.emit('test-event', testData);

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual(testData);

        // Cleanup listener
        commsPubSub.removeAllListeners('test-event');
    });

    it('채널별 이벤트 구분이 된다', async () => {
        const { default: commsPubSub } = await import('./comms-pubsub');

        const globalMessages: unknown[] = [];
        const teamMessages: unknown[] = [];

        commsPubSub.on('comms:global', (data: unknown) => globalMessages.push(data));
        commsPubSub.on('comms:team-1', (data: unknown) => teamMessages.push(data));

        commsPubSub.emit('comms:global', { content: 'global msg' });
        commsPubSub.emit('comms:team-1', { content: 'team msg' });

        expect(globalMessages).toHaveLength(1);
        expect(teamMessages).toHaveLength(1);
        expect((globalMessages[0] as any).content).toBe('global msg');
        expect((teamMessages[0] as any).content).toBe('team msg');

        commsPubSub.removeAllListeners('comms:global');
        commsPubSub.removeAllListeners('comms:team-1');
    });

    it('maxListeners가 100으로 설정됨', async () => {
        const { default: commsPubSub } = await import('./comms-pubsub');
        expect(commsPubSub.getMaxListeners()).toBe(100);
    });
});
