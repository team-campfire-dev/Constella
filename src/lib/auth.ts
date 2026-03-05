import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import prisma from "@/lib/prisma"
import crypto from "node:crypto"

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
            name: 'Local Agent',
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                const agentEmail = process.env.AGENT_EMAIL;
                const agentPassword = process.env.AGENT_PASSWORD;

                if (agentEmail && agentPassword &&
                    credentials?.username === agentEmail &&
                    // Use safeCompare to prevent timing attacks
                    safeCompare(credentials?.password || "", agentPassword)) {
                    const user = await prisma.user.findUnique({
                        where: { email: agentEmail }
                    });
                    return user;
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
