import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

/**
 * GET /api/expedition — List my expeditions (owned + member of)
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    try {
        const memberships = await prismaContent.expeditionMember.findMany({
            where: { userId },
            include: {
                expedition: {
                    include: {
                        _count: {
                            select: {
                                members: true,
                                sharedLogs: true,
                            },
                        },
                    },
                },
            },
            orderBy: { joinedAt: 'desc' },
        });

        // Fetch owner names from main DB
        const ownerIds = Array.from(new Set(memberships.map(m => m.expedition.ownerId)));
        const owners = await prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, name: true, image: true },
        });
        const ownerMap = new Map(owners.map(u => [u.id, u]));

        const data = memberships.map(m => ({
            id: m.expedition.id,
            name: m.expedition.name,
            description: m.expedition.description,
            status: m.expedition.status,
            role: m.role,
            owner: {
                id: m.expedition.ownerId,
                name: ownerMap.get(m.expedition.ownerId)?.name || 'Unknown',
                image: ownerMap.get(m.expedition.ownerId)?.image || null,
            },
            memberCount: m.expedition._count.members,
            discoveryCount: m.expedition._count.sharedLogs,
            createdAt: m.expedition.createdAt,
        }));

        return NextResponse.json({ success: true, data });
    } catch (error) {
        logger.error("Expedition list error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch expeditions' }, { status: 500 });
    }
}

/**
 * POST /api/expedition — Create a new expedition
 * Body: { name, description? }
 */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    try {
        const { name, description } = await req.json();

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        // Ensure user exists in content DB
        await prismaContent.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} });

        const expedition = await prismaContent.expedition.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                ownerId: userId,
                members: {
                    create: {
                        userId,
                        role: 'owner',
                    },
                },
            },
        });

        return NextResponse.json({
            success: true,
            data: { id: expedition.id, name: expedition.name },
        });
    } catch (error) {
        logger.error("Expedition create error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to create expedition' }, { status: 500 });
    }
}
