import { getDriver } from '../src/lib/neo4j';
import dotenv from 'dotenv';

dotenv.config();

async function resetNeo4j() {
    const driver = getDriver();
    const session = driver.session();
    try {
        console.log("Cleaning up Neo4j database...");
        await session.run('MATCH (n) DETACH DELETE n');
        console.log("Neo4j database cleared successfully.");
    } catch (error) {
        console.error("Error clearing Neo4j:", error);
    } finally {
        await session.close();
        // Driver singleton closure
        await driver.close();
    }
}

resetNeo4j();
