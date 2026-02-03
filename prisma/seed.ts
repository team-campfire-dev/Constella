
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const agentEmail = 'agent@test.local'
    const agentName = 'Dev Agent'
    const agentId = 'dev-agent'

    const upsertUser = await prisma.user.upsert({
        where: { email: agentEmail },
        update: {
            name: agentName,
        },
        create: {
            id: agentId,
            email: agentEmail,
            name: agentName,
        },
    })

    console.log({ upsertUser })
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
