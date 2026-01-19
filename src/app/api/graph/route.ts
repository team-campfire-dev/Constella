import { NextResponse, NextRequest } from 'next/server';
import { getDriver } from '@/lib/neo4j';
import logger from "@/lib/logger";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from '@prisma/client-content';

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;

    try {
        const { default: prismaContent } = await import('@/lib/prisma-content');

        // 1. Fetch User's Discovered Topics with Localized Title
        const { searchParams } = new URL(req.url);
        const lang = searchParams.get('lang') || 'en';

        const shipLogs = await prismaContent.shipLog.findMany({
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
            }
        });

        // If empty, return just empty graph (or start node logic if we had one)
        if (shipLogs.length === 0) {
            return NextResponse.json({ nodes: [], links: [] });
        }

        const discoveredNames = shipLogs.map(log => log.topic.name);

        // Batch Translation for missing localized titles
        const newTranslations: Record<string, string> = {};
        if (lang !== 'en') {
            const missingTopics = shipLogs.filter(log => !log.topic.articles[0]?.title);
            if (missingTopics.length > 0) {
                const missingNames = missingTopics.map(l => l.topic.name);
                try {
                    const { batchTranslate } = await import('@/lib/gemini');
                    const results = await batchTranslate(missingNames, lang);
                    Object.assign(newTranslations, results);

                    // Persist to DB (Lazy)
                    await prismaContent.$transaction(
                        Object.entries(results).map(([canonical, translated]) => {
                            const topicId = missingTopics.find(t => t.topic.name === canonical)?.topic.id;
                            if (!topicId) return null; // Should not happen

                            // Return the promise
                            return prismaContent.wikiArticle.upsert({
                                where: { topicId_language: { topicId, language: lang } },
                                update: { title: translated },
                                create: { topicId, language: lang, title: translated, content: null }
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            }) as any;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        }).filter((x): x is Prisma.PrismaPromise<any> => x !== null)
                    );
                } catch (e) {
                    logger.error("Graph Batch Translation Error", { error: e });
                }
            }
        }

        // Create a map for localized names: Canonical -> Localized
        const localizedNameMap = new Map<string, string>();
        shipLogs.forEach(log => {
            // Priority: New Translation > Existing DB Title > Canonical
            const distinctTitle = newTranslations[log.topic.name] || log.topic.articles[0]?.title;
            if (distinctTitle) {
                localizedNameMap.set(log.topic.name, distinctTitle);
            }
        });

        // 2. Query Neo4j
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const links: any[] = [];

            result.records.forEach(record => {
                const sourceNode = record.get('n'); // Known Node
                const rel = record.get('r');
                const targetNode = record.get('m'); // Potential Mystery Node

                if (sourceNode) {
                    const id = sourceNode.identity.toString();
                    if (!nodesMap.has(id)) {
                        const canonicalName = sourceNode.properties.name;
                        const displayName = localizedNameMap.get(canonicalName) || canonicalName;

                        nodesMap.set(id, {
                            id,
                            topicId: sourceNode.properties.topicId, // Expose UUID
                            name: displayName,
                            val: 20, // Discovered nodes are large
                            color: '#00F0FF', // Cyan
                            group: 'known',
                            canonical: canonicalName
                        });
                    }
                }

                if (targetNode) {
                    const id = targetNode.identity.toString();
                    const canonicalName = targetNode.properties.name;
                    const isDiscovered = discoveredNames.includes(canonicalName);

                    if (!nodesMap.has(id)) {
                        if (isDiscovered) {
                            const displayName = localizedNameMap.get(canonicalName) || canonicalName;
                            nodesMap.set(id, {
                                id,
                                topicId: targetNode.properties.topicId,
                                name: displayName,
                                val: 20,
                                color: '#00F0FF',
                                group: 'known',
                                canonical: canonicalName
                            });
                        } else {
                            // Mystery Node
                            nodesMap.set(id, {
                                id,
                                name: canonicalName,
                                val: 10,
                                color: '#FFA500', // Orange for mystery/unexplored
                                group: 'mystery',
                                canonical: canonicalName
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

            logger.info(`[GraphAPI] Returning ${nodesMap.size} nodes`, {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                known: Array.from(nodesMap.values()).filter((n: any) => n.group === 'known').length,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                mystery: Array.from(nodesMap.values()).filter((n: any) => n.group === 'mystery').length,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                names: Array.from(nodesMap.values()).map((n: any) => n.name)
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

