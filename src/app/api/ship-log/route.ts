import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import logger from "@/lib/logger";

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get('lang') || 'en';

    try {
        // 1. Fetch User's ShipLog from Content DB (with Topic relation and localized Article)
        const logs = await prismaContent.shipLog.findMany({
            where: { userId },
            include: {
                topic: {
                    include: {
                        articles: {
                            where: { language: lang },
                            select: { title: true }
                        }
                    }
                }
            },
            orderBy: { discoveredAt: 'desc' }
        });

        if (logs.length === 0) {
            return NextResponse.json({ logs: [] });
        }

        // 2. Format Data
        const formattedLogs = logs.map(log => {
            const displayTitle = log.topic.articles[0]?.title || log.topic.name;
            return {
                id: log.id,
                topicId: log.topicId,
                discoveredAt: log.discoveredAt,
                name: displayTitle,
                lastUpdated: log.topic.updatedAt
            };
        });

        return NextResponse.json({ logs: formattedLogs });

    } catch (error) {
        logger.error('Failed to fetch ship logs:', { error });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
