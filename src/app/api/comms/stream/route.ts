// 📡 SSE (Server-Sent Events) stream for real-time COMMS
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import commsPubSub, { CommsEvent } from '@/lib/comms-pubsub';
import logger from '@/lib/logger';
import prismaContent from '@/lib/prisma-content';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const channel = req.nextUrl.searchParams.get('channel') || 'global';
    const userId = session.user.id;

    // 🛡️ Sentinel: Authorize channel access
    if (channel.startsWith('dm:')) {
        const participants = channel.replace('dm:', '').split('_');
        if (participants.length !== 2 || !participants.includes(userId)) {
            logger.warn(`Unauthorized SSE DM access attempt: user=${userId}, channel=${channel}`);
            return new Response('Forbidden', { status: 403 });
        }
        const expectedChannel = `dm:${[participants[0], participants[1]].sort().join('_')}`;
        if (channel !== expectedChannel) {
            logger.warn(`Invalid SSE DM channel format attempt: user=${userId}, channel=${channel}`);
            return new Response('Invalid channel format', { status: 400 });
        }
    } else if (channel.startsWith('expedition:')) {
        const expeditionId = channel.replace('expedition:', '');
        const membership = await prismaContent.expeditionMember.findUnique({
            where: { expeditionId_userId: { expeditionId, userId } }
        });
        if (!membership) {
            logger.warn(`Unauthorized SSE Expedition access attempt: user=${userId}, channel=${channel}`);
            return new Response('Forbidden', { status: 403 });
        }
    } else if (channel.startsWith('topic:')) {
        const topicId = channel.replace('topic:', '');
        const [personalLog, sharedLog] = await Promise.all([
            prismaContent.shipLog.findUnique({
                where: { userId_topicId: { userId, topicId } }
            }),
            prismaContent.expeditionShipLog.findFirst({
                where: {
                    topicId,
                    expedition: {
                        members: {
                            some: { userId }
                        }
                    }
                }
            })
        ]);

        if (!personalLog && !sharedLog) {
            logger.warn(`Unauthorized SSE Topic access attempt: user=${userId}, channel=${channel}`);
            return new Response('Forbidden', { status: 403 });
        }
    }

    logger.info(`SSE client connected: user=${userId}, channel=${channel}`);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            // Send initial heartbeat to confirm connection
            controller.enqueue(encoder.encode(': connected\n\n'));

            const onMessage = (event: CommsEvent) => {
                try {
                    const data = JSON.stringify(event);
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                    // Stream closed, cleanup will happen via abort
                }
            };

            const eventName = `comms:${channel}`;
            commsPubSub.on(eventName, onMessage);

            // Heartbeat every 30 seconds to prevent proxy/LB timeouts
            const heartbeat = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': heartbeat\n\n'));
                } catch {
                    clearInterval(heartbeat);
                }
            }, 30000);

            // Cleanup on client disconnect
            req.signal.addEventListener('abort', () => {
                commsPubSub.off(eventName, onMessage);
                clearInterval(heartbeat);
                logger.info(`SSE client disconnected: user=${userId}, channel=${channel}`);
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Prevent Nginx buffering
        },
    });
}
