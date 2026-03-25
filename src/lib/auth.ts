import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import prisma from "@/lib/prisma"
import crypto from "node:crypto"
import bcrypt from "bcryptjs"

/**
 * Compares two strings using a constant-time algorithm to prevent timing attacks.
 * It hashes both strings first to ensure equal length comparison.
 */
function safeCompare(a: string, b: string): boolean {
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
}

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        }),
        CredentialsProvider({
            name: 'Constella Account',
            credentials: {
                username: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) {
                    return null;
                }

                // 1. Agent Account Check (Legacy/Admin support)
                const agentEmail = process.env.AGENT_EMAIL;
                const agentPassword = process.env.AGENT_PASSWORD;

                if (agentEmail && agentPassword &&
                    credentials.username === agentEmail &&
                    safeCompare(credentials.password, agentPassword)) {
                    return await prisma.user.findUnique({
                        where: { email: agentEmail }
                    });
                }

                // 2. Regular User DB Check
                const user = await prisma.user.findUnique({
                    where: { email: credentials.username }
                });

                if (user && user.password) {
                    const isValid = await bcrypt.compare(credentials.password, user.password);
                    if (isValid) {
                        return user;
                    }
                }

                return null;
            }
        }),
    ],
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async signIn() {
            return true;
        },
        async session({ session, token }) {
            if (session.user && token.sub) {
                session.user.id = token.sub;
            }
            return session;
        },
        async jwt({ token, user }) {
            if (user) {
                token.sub = user.id;
            }
            return token;
        }
    },
}
