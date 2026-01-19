import { PrismaClient } from '@prisma/client-content'

const prismaClientContentSingleton = () => {
    return new PrismaClient()
}

type PrismaClientContentSingleton = ReturnType<typeof prismaClientContentSingleton>

const globalForPrismaContent = globalThis as unknown as {
    prismaContent: PrismaClientContentSingleton | undefined
}

const prismaContent = globalForPrismaContent.prismaContent ?? prismaClientContentSingleton()

export default prismaContent

if (process.env.NODE_ENV !== 'production') globalForPrismaContent.prismaContent = prismaContent
