import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
    const email = process.env.AGENT_EMAIL
    if (!email) {
        console.error('Error: AGENT_EMAIL environment variable must be set.')
        process.exit(1)
    }

    console.log(`Checking for user: ${email}`)

    const user = await prisma.user.findUnique({
        where: { email },
    })

    if (user) {
        console.log('User found:', user.email)
    } else {
        console.log('User NOT found. Creating user...')
        try {
            const newUser = await prisma.user.create({
                data: {
                    email: email,
                    name: 'Local Agent',
                    role: 'ADMIN',
                },
            })
            console.log('User created:', newUser.email)
        } catch (error) {
            console.error('Error creating user:', error)
            process.exit(1)
        }
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
