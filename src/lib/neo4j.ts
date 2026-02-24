import neo4j, { Driver } from 'neo4j-driver';
import logger from "@/lib/logger";

const neo4jDriverSingleton = () => {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER;
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !user || !password) {
        const errorMessage = 'Missing Neo4j environment variables (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD). ' +
            'Please ensure they are defined in your .env file.';
        logger.error(errorMessage);
        throw new Error(errorMessage);
    }

    return neo4j.driver(
        uri,
        neo4j.auth.basic(user, password)
    );
};

type Neo4jDriverSingleton = ReturnType<typeof neo4jDriverSingleton>;

const globalForNeo4j = globalThis as unknown as {
    neo4jDriver: Neo4jDriverSingleton | undefined;
};

const driver = globalForNeo4j.neo4jDriver ?? neo4jDriverSingleton();

if (process.env.NODE_ENV !== 'production') globalForNeo4j.neo4jDriver = driver;

export function getDriver(): Driver {
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
MATCH(n)
            OPTIONAL MATCH(n) - [r] -> (m)
            RETURN n, r, m
            LIMIT 100
        `);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nodesMap = new Map<string, any>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                        name: sourceNode.properties.name || `Node ${id} `,
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
                        name: targetNode.properties.name || `Node ${id} `,
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
