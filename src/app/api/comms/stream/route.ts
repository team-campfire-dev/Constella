// 📡 SSE (Server-Sent Events) stream for real-time COMMS
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import commsPubSub, { CommsEvent } from '@/lib/comms-pubsub';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const channel = req.nextUrl.searchParams.get('channel') || 'global';
    const userId = session.user.id;

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
