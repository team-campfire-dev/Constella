import { getDriver } from '../src/lib/neo4j';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    const driver = getDriver();
    const session = driver.session();
    try {
        console.log("=== Dumping Neo4j Nodes & Relationships ===");

        const result = await session.run(`
            MATCH (n:Topic)
            OPTIONAL MATCH (n)-[r]->(m:Topic)
            RETURN n.name, type(r), m.name
        `);

        if (result.records.length === 0) {
            console.log("Graph is empty.");
        } else {
            result.records.forEach(r => {
                const n = r.get('n.name');
                const rel = r.get('type(r)');
                const m = r.get('m.name');
                if (m) {
                    console.log(`(${n}) -[:${rel}]-> (${m})`);
                } else {
                    console.log(`(${n}) (Isolated)`);
                }
            });
        }

        console.log("===========================================");
    } catch (e) {
        console.error(e);
    } finally {
        await session.close();
        await driver.close();
    }
}

main();
