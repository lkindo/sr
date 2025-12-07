import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma';

export async function GET() {
    const dbUrl = process.env.DATABASE_URL || 'NOT_SET';
    console.log('Current DATABASE_URL:', dbUrl);

    try {
        // 1. Check Env
        if (dbUrl === 'NOT_SET') throw new Error('DATABASE_URL missing');

        // 2. Try default prisma instance
        console.log('Testing default prisma instance...');
        const user = await prisma.user.findUnique({
            where: { email: 'admin@example.com' },
        });
        console.log('Default prisma user found:', !!user);

        // 3. Try fresh instance if default fails? (Usually default failure throws immediately)

        // Reset Pass
        if (user) {
            const password = await hash('admin123', 10);
            await prisma.user.update({
                where: { email: 'admin@example.com' },
                data: { password },
            });
            return NextResponse.json({ success: true, email: user.email, dbUrlMasked: dbUrl.replace(/:[^:@]*@/, ':***@') });
        } else {
            return NextResponse.json({ success: false, error: 'User not found', dbUrlMasked: dbUrl.replace(/:[^:@]*@/, ':***@') }, { status: 404 });
        }

    } catch (error) {
        console.error('Debug Route Failed:', error);
        return NextResponse.json({
            success: false,
            error: String(error),
            dbUrlMasked: dbUrl.replace(/:[^:@]*@/, ':***@'),
            envDirectUrl: (process.env.DIRECT_URL || '').replace(/:[^:@]*@/, ':***@')
        }, { status: 500 });
    }
}
