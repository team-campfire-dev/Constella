
// tools/test-wiki-flow.ts
import prisma from '@/lib/prisma';
import prismaContent from '@/lib/prisma-content';
import { processUserQuery } from '@/lib/wiki-engine';

async function main() {
    console.log("🚀 Starting Wiki Engine Flow Verification...");

    const TEST_EMAIL = "pilot_test@constella.io";
    const QUERY = "Black Hole";
    const LANG = "ko";

    // 1. Ensure User Exists
    console.log("1️⃣ Ensuring Test User...");
    const user = await prisma.user.upsert({
        where: { email: TEST_EMAIL },
        update: {},
        create: {
            email: TEST_EMAIL,
            name: "Test Pilot",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=pilot"
        }
    });
    console.log(`✅ User Ready: ${user.id}`);

    // 2. Process Query
    console.log(`2️⃣ Processing Query: "${QUERY}" (${LANG})...`);
    try {
        const response = await processUserQuery(user.id, QUERY, LANG);
        console.log("✅ Response Received:");
        console.log(`   - Topic ID: ${response.topicId}`);
        console.log(`   - Is New: ${response.isNew}`);
        console.log(`   - Content Preview: ${response.content.substring(0, 50)}...`);
    } catch (e) {
        console.error("❌ processUserQuery Failed:", e);
        process.exit(1);
    }

    // 3. Verify ShipLog
    console.log("3️⃣ Verifying ShipLog in Content DB...");
    const log = await prismaContent.shipLog.findFirst({
        where: { userId: user.id, topicId: { not: undefined } } // Just find any for this user, ideally matching topicId
    });

    if (log) {
        console.log(`✅ ShipLog Found! ID: ${log.id}, TopicRef: ${log.topicId}, Updated: ${log.discoveredAt}`);
    } else {
        console.error("❌ NO SHIPLOG FOUND for user! Data persistence failed.");
    }

    // 4. Verify Content DB
    console.log("4️⃣ Verifying Content DB...");
    const topic = await prismaContent.topic.findFirst({
        where: { name: QUERY.toLowerCase() },
        include: { articles: true }
    });

    if (topic && topic.articles.length > 0) {
        const article = topic.articles[0];
        console.log(`✅ Topic Found in Content DB! ID: ${topic.id}`);
        console.log(`   - Article Lang: ${article.language}`);
    } else {
        console.error("❌ TOPIC/ARTICLE NOT FOUND in Content DB.");
    }

    console.log("🏁 Test Complete.");
    process.exit(0);
}

main();
