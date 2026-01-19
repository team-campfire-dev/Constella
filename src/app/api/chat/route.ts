import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processUserQuery } from "@/lib/wiki-engine";
import prismaContent from "@/lib/prisma-content";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.email) {
        if (!session?.user && !('id' in (session?.user || {}))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const userId = (session?.user as any).id;

    try {
        const { message, language } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // 0. Ensure User exists in Content DB (Sync)
        await prismaContent.user.upsert({
            where: { id: userId },
            create: { id: userId },
            update: {}
        });

        // 1. Save User Message
        const userMsg = await prismaContent.chatHistory.create({
            data: {
                userId,
                role: 'user',
                content: message
            }
        });

        const response = await processUserQuery(userId, message, language || 'en');

        // 2. Save AI Message
        const aiMsg = await prismaContent.chatHistory.create({
            data: {
                userId,
                role: 'assistant',
                content: response.content
            }
        });

        return NextResponse.json({
            success: true,
            data: response
        });
    } catch (error) {
        console.error("Chat API Error:", error);
        return NextResponse.json({ error: 'Failed to process query' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    try {
        const history = await prismaContent.chatHistory.findMany({
            where: { userId },
            orderBy: { createdAt: 'asc' },
            take: 50
        });

        return NextResponse.json({
            success: true,
            data: history.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: msg.createdAt
            }))
        });
    } catch (error) {
        console.error("Fetch History Error:", error);
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }
}
