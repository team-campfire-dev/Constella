import neo4j, { Driver, Session } from 'neo4j-driver';

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

    // Use the specific database 'Constella'
    // If it doesn't exist, this might fail unless we create it. 
    // Usually handled by admin, but we can try-catch or assume user created it.
    // Community Edition only supports default database ('neo4j')
    const session = driver.session();

    try {
        // Query to fetch all nodes and relationships
        // Adjust the LIMIT as needed
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
        console.error('Neo4j Query Error:', error);
        throw error;
    } finally {
        await session.close();
    }
}
