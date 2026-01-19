import { NextResponse } from 'next/server';
import { getDriver } from '@/lib/neo4j';
import logger from "@/lib/logger"; // Using driver directly for custom query
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    try {
        const { default: prismaContent } = await import('@/lib/prisma-content');

        // 1. Fetch User's Discovered Topics
        const shipLogs = await prismaContent.shipLog.findMany({
            where: { userId },
            include: { topic: true }
        });

        // Even if empty, we might want to show a "Start Node" or something?
        // For now, if empty, return empty (Star Map will be black).
        // User needs to discover something via Console first.
        if (shipLogs.length === 0) {
            return NextResponse.json({ nodes: [], links: [] });
        }

        const discoveredNames = shipLogs.map(log => log.topic.name);

        // 2. Query Neo4j
        // We want:
        // - All Discovered Nodes (n)
        // - All Nodes directly connected to Discovered Nodes (m) -> "Mystery Nodes"
        // - Relationships between them
        const driver = getDriver();
        const sessionNeo = driver.session();

        try {
            const result = await sessionNeo.run(`
                MATCH (n:Topic)
                WHERE n.name IN $names
                OPTIONAL MATCH (n)-[r]-(m:Topic)
                RETURN n, r, m
            `, { names: discoveredNames });

            const nodesMap = new Map();
            const links: any[] = [];

            result.records.forEach(record => {
                const sourceNode = record.get('n'); // Known Node
                const rel = record.get('r');
                const targetNode = record.get('m'); // Potential Mystery Node

                if (sourceNode) {
                    const id = sourceNode.identity.toString();
                    if (!nodesMap.has(id)) {
                        nodesMap.set(id, {
                            id,
                            name: sourceNode.properties.name,
                            val: 20, // Discovered nodes are large
                            color: '#00F0FF', // Cyan
                            group: 'known'
                        });
                    }
                }

                if (targetNode) {
                    const id = targetNode.identity.toString();
                    const name = targetNode.properties.name;
                    const isDiscovered = discoveredNames.includes(name);

                    if (!nodesMap.has(id)) {
                        if (isDiscovered) {
                            nodesMap.set(id, {
                                id,
                                name: name,
                                val: 20,
                                color: '#00F0FF',
                                group: 'known'
                            });
                        } else {
                            // Mystery Node
                            nodesMap.set(id, {
                                id,
                                name: name, // We show name? Or "???"
                                // Game Design Choice: Outer Wilds shows the name but "There's more to explore here".
                                // Let's show name but style it differently.
                                val: 10,
                                color: '#FFA500', // Orange for mystery/unexplored
                                group: 'mystery'
                            });
                        }
                    }
                }

                if (rel && sourceNode && targetNode) {
                    links.push({
                        source: sourceNode.identity.toString(),
                        target: targetNode.identity.toString(),
                        type: rel.type
                    });
                }
            });

            return NextResponse.json({
                nodes: Array.from(nodesMap.values()),
                links
            });

        } finally {
            await sessionNeo.close();
        }

    } catch (error) {
        if (error instanceof Error) {
            logger.error('Failed to fetch filtered graph data:', { error: error.message });
        } else {
            logger.error('Failed to fetch filtered graph data:', { error });
        }
        return NextResponse.json({ error: 'Failed to fetch graph data' }, { status: 500 });
    }
}
