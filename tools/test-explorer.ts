import 'dotenv/config';
import prisma from '@/lib/prisma';
import prismaContent from '@/lib/prisma-content';

(async () => {
    const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true, image: true, bio: true },
        take: 10,
    });
    console.log('=== Users in Main DB ===');
    for (const u of users) {
        console.log(`  ${u.id}  ${u.name}  ${u.email}`);
    }

    if (users.length === 0) {
        console.log('No users found.');
        process.exit(0);
    }

    // Use first user as test target
    const target = users[0];
    console.log(`\n=== Testing explorer-equivalent fetch for: ${target.id} (${target.name}) ===`);

    const [totalDiscoveries, shipLogs, contentUser] = await Promise.all([
        prismaContent.shipLog.count({ where: { userId: target.id } }),
        prismaContent.shipLog.findMany({
            where: { userId: target.id },
            include: { topic: { include: { articles: { take: 1 } } } },
            orderBy: { discoveredAt: 'desc' },
            take: 10,
        }),
        prismaContent.user.findUnique({ where: { id: target.id } }),
    ]);

    console.log('Content DB user exists?', !!contentUser);
    console.log('totalDiscoveries:', totalDiscoveries);
    console.log('shipLogs.length:', shipLogs.length);
    if (shipLogs.length > 0) {
        console.log('First shipLog:', {
            topicId: shipLogs[0].topicId,
            topicName: shipLogs[0].topic?.name,
            articleTitle: shipLogs[0].topic?.articles[0]?.title,
            discoveredAt: shipLogs[0].discoveredAt,
        });
    }

    const followersCount = await prismaContent.follow.count({ where: { followingId: target.id } });
    const followingCount = await prismaContent.follow.count({ where: { followerId: target.id } });
    console.log('followers:', followersCount, 'following:', followingCount);

    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
