import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import logger from "@/lib/logger";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    try {
        // 1. Fetch User's ShipLog from Content DB (with Topic relation!)
        const logs = await prismaContent.shipLog.findMany({
            where: { userId },
            include: {
                topic: true
            },
            orderBy: { discoveredAt: 'desc' }
        });

        if (logs.length === 0) {
            return NextResponse.json({ logs: [] });
        }

        // 2. Format Data
        const formattedLogs = logs.map(log => {
            return {
                id: log.id,
                topicId: log.topicId,
                discoveredAt: log.discoveredAt,
                name: log.topic.name,
                lastUpdated: log.topic.updatedAt
            };
        });

        return NextResponse.json({ logs: formattedLogs });

    } catch (error) {
        logger.error('Failed to fetch ship logs:', { error });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
