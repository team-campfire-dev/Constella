
// tools/verify-clients.ts
import { PrismaClient as PrismaClientMain } from '@prisma/client';
import { PrismaClient as PrismaClientContent } from '@prisma/client-content';

async function main() {
    console.log("Verifying Prisma Clients...");

    try {
        const p1 = new PrismaClientMain();
        console.log("✅ Main Prisma Client Loaded");

        const p2 = new PrismaClientContent();
        console.log("✅ Content Prisma Client Loaded");

        await p1.$disconnect();
        await p2.$disconnect();

        console.log("ALL SYSTEMS GREEN. Build should succeed.");
        process.exit(0);
    } catch (e) {
        console.error("❌ Client Verification Failed:", e);
        process.exit(1);
    }
}

main();
