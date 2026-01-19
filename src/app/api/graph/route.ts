import { NextResponse } from 'next/server';
import { getGraphData } from '@/lib/neo4j';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const data = await getGraphData();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Failed to fetch graph data:', error);
        return NextResponse.json({ error: 'Failed to fetch graph data' }, { status: 500 });
    }
}
