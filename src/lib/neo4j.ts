import neo4j, { Driver, Session } from 'neo4j-driver';
import logger from "@/lib/logger";

let driver: Driver;

export function getDriver(): Driver {
    if (!driver) {
        driver = neo4j.driver(
            process.env.NEO4J_URI || 'bolt://localhost:7687',
            neo4j.auth.basic(
                process.env.NEO4J_USER || 'neo4j',
                process.env.NEO4J_PASSWORD || 'password'
            )
        );
    }
    return driver;
}

export async function getGraphData() {
    const driver = getDriver();

    // Constella 데이터베이스는 Community Edition에서 지원되지 않으므로 기본 DB 사용
    // 별도 로직으로 데이터 격리 필요 시 레이블(Label) 등을 활용 권장
    const session = driver.session();

    try {
        // 노드 및 관계 조회 (최대 100개)
        const result = await session.run(`
            MATCH (n)
            OPTIONAL MATCH (n)-[r]->(m)
            RETURN n, r, m
            LIMIT 100
        `);

        const nodesMap = new Map();
        const links: any[] = [];

        result.records.forEach(record => {
            const sourceNode = record.get('n');
            const rel = record.get('r');
            const targetNode = record.get('m');

            if (sourceNode) {
                const id = sourceNode.identity.toString();
                if (!nodesMap.has(id)) {
                    nodesMap.set(id, {
                        id,
                        name: sourceNode.properties.name || `Node ${id}`,
                        // Map other properties if needed
                        group: sourceNode.labels[0] || 'default',
                        val: 1, // Default size
                        ...sourceNode.properties
                    });
                }
            }

            if (targetNode) {
                const id = targetNode.identity.toString();
                if (!nodesMap.has(id)) {
                    nodesMap.set(id, {
                        id,
                        name: targetNode.properties.name || `Node ${id}`,
                        group: targetNode.labels[0] || 'default',
                        val: 1,
                        ...targetNode.properties
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

        return {
            nodes: Array.from(nodesMap.values()),
            links
        };
    } catch (error) {
        logger.error('Neo4j Query Error:', { error: error instanceof Error ? error.message : error });
        throw error;
    } finally {
        await session.close();
    }
}
