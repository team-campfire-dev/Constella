import { getDriver } from '../src/lib/neo4j';
import { PrismaClient } from '@prisma/client-content';
import dotenv from 'dotenv';
import path from 'path';

// Load env from root
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function fixNeo4jIds() {
    const driver = getDriver();
    const session = driver.session();

    try {
        console.log("Fetching all topics from MySQL...");
        const topics = await prisma.topic.findMany();
        console.log(`Found ${topics.length} topics.`);

        for (const topic of topics) {
            console.log(`Syncing ID for topic: ${topic.name} (${topic.id})`);

            // Update Neo4j node with matching name
            // Note: Names are unique in Constella logic
            await session.run(`
                MATCH (n:Topic)
                WHERE n.name = $name
                SET n.topicId = $id
            `, {
                name: topic.name,
                id: topic.id
            });
        }

        console.log("Synchonization complete.");
    } catch (error) {
        console.error("Error during sync:", error);
    } finally {
        await session.close();
        await driver.close();
        await prisma.$disconnect();
    }
}

fixNeo4jIds();
