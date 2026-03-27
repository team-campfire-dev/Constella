import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import prismaContent from '@/lib/prisma-content';
import logger from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';

const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

export async function POST(req: Request) {
    // 🛡️ Sentinel: Apply rate limiting to prevent spam registration
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown-ip';
    if (!checkRateLimit('auth_register', ip, RATE_LIMIT_WINDOW_MS)) {
        logger.warn(`Rate limit exceeded for IP: ${ip} on endpoint: auth_register`);
        return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    try {
        const { name, email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json({ error: 'User already exists' }, { status: 400 });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user in Main DB
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
            },
        });

        // Sync to Content DB (Constella architecture requirement)
        await prismaContent.user.upsert({
            where: { id: user.id },
            update: {},
            create: { id: user.id },
        });

        logger.info(`New user registered: ${email}`);

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error: unknown) {
        logger.error('Registration error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
