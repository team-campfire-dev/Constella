import { NextResponse } from 'next/server';
import { getDriver } from '@/lib/neo4j'; // Using driver directly for custom query
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
        // 1. Fetch User's Discovered Topics (ShipLog) from Content DB
        // Dynamic import not needed ideally if we assume prismaContent is available, 
        // but 'prismaContent' is already imported via dynamic import in original code? 
        // No, I'll use import at top or just the dynamic one?
        // Let's use the dynamic one or standard import if available.
        // File has 'import prisma from ...', I should check lines 1-6.
        // It has 'import prisma' but DOES NOT have 'prismaContent' imported at top level in original.
        // I will add import at top level for cleaner code or use dynamic.

        const { default: prismaContent } = await import('@/lib/prisma-content');

        const shipLogs = await prismaContent.shipLog.findMany({
            where: { userId },
            include: { topic: true }
        });

        if (shipLogs.length === 0) {
            return NextResponse.json({ nodes: [], links: [] });
        }

        const discoveredNames = shipLogs.map(log => log.topic.name);

        // 2. Query Neo4j for these specific nodes and their connections
        const driver = getDriver();
        const sessionNeo = driver.session();

        try {
            /*
               Strategy:
               1. Match Discovered Nodes (n).
               2. Find all relationships (r) and neighbors (m) connected to n.
               3. Return n (discovered), r, and m (could be discovered or undiscovered).
            */
            const result = await sessionNeo.run(`
               MATCH (n:Topic)
               WHERE n.name IN $names
               OPTIONAL MATCH (n)-[r]-(m:Topic)
               RETURN n, r, m
           `, { names: discoveredNames });

            const nodesMap = new Map();
            const links: any[] = [];

            result.records.forEach(record => {
                const sourceNode = record.get('n');
                const rel = record.get('r');
                const targetNode = record.get('m');

                if (sourceNode) {
                    const id = sourceNode.identity.toString();
                    // Use 'name' as ID for visualization stability if preferred, or internal ID
                    // Let's use internal ID but ensure uniqueness
                    if (!nodesMap.has(id)) {
                        nodesMap.set(id, {
                            id,
                            val: 1,
                            name: sourceNode.properties.name,
                            ...sourceNode.properties
                        });
                    }
                }

                if (targetNode) {
                    const id = targetNode.identity.toString();
                    if (!nodesMap.has(id)) {
                        const name = targetNode.properties.name;
                        const isDiscovered = discoveredNames.includes(name);

                        nodesMap.set(id, {
                            id,
                            val: isDiscovered ? 2 : 1, // Bigger if discovered
                            name: name,
                            ...targetNode.properties,
                            ghost: !isDiscovered,
                            color: isDiscovered ? '#00f7ff' : '#4a5568' // Cyan vs Gray
                        });
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
        console.error('Failed to fetch filtered graph data:', error);
        return NextResponse.json({ error: 'Failed to fetch graph data' }, { status: 500 });
    }
}
