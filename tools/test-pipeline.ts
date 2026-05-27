import 'dotenv/config';
import { processUserQuery } from '@/lib/wiki-engine';
import prisma from '@/lib/prisma';

const topic = process.argv[2] ?? '양자역학';
const language = process.argv[3] ?? 'ko';

(async () => {
    // 시드된 agent 유저를 사용 (prisma/seed.ts 참조)
    const user = await prisma.user.findFirst({
        where: { email: process.env.AGENT_EMAIL ?? 'agent@test.local' },
    });
    if (!user) {
        console.error('Agent user not found. Run: npx tsx prisma/seed.ts');
        process.exit(1);
    }

    console.log(`>>> processUserQuery(user=${user.id}, query=${JSON.stringify(topic)}, lang=${language})`);
    const start = Date.now();
    const result = await processUserQuery(user.id, topic, language);
    const ms = Date.now() - start;

    console.log(`\n=== result (${ms}ms) ===`);
    console.log('topicId:', result.topicId);
    console.log('isNew:', result.isNew);
    console.log('\n=== answer (chat bubble) ===');
    console.log(result.answer);
    console.log('\n=== content (wiki body) ===');
    console.log(result.content);
    console.log('\n=== content stats ===');
    console.log('  length:', result.content.length, 'chars');
    console.log('  words:', result.content.split(/\s+/).filter(Boolean).length);
    console.log('  headings:', (result.content.match(/^##\s/gm) || []).length);
    console.log('  [[links]]:', (result.content.match(/\[\[[^\]]+\]\]/g) || []).length);

    process.exit(0);
})().catch(e => {
    console.error('FAILED:', e);
    process.exit(1);
});
