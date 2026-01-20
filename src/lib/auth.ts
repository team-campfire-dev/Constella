import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import prisma from "@/lib/prisma"

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        }),
    ],
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async signIn({ user, account, profile }) {
            console.log("[AuthDebug] SignIn Callback:", {
                userId: user.id,
                email: user.email,
                provider: account?.provider,
                providerAccountId: account?.providerAccountId
            });
            return true;
        },
        async session({ session, token }) {
            if (session.user && token.sub) {
                session.user.id = token.sub;
            }
            console.log("[AuthDebug] Session Callback:", {
                sessionUserId: session.user?.id,
                tokenSub: token.sub
            });
            return session;
        },
        async jwt({ token, user, account }) {
            if (user) {
                token.sub = user.id;
                console.log("[AuthDebug] JWT Callback (Initial Sign In):", {
                    userId: user.id,
                    tokenSub: token.sub,
                    provider: account?.provider
                });
            } else {
                console.log("[AuthDebug] JWT Callback (Session Update):", {
                    tokenSub: token.sub
                });
            }
            return token;
        }
    },
}
