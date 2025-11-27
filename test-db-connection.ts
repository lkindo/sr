import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
    try {
        console.log('🔍 Testing database connection...');

        // Simple query to test connection
        const userCount = await prisma.user.count();
        console.log('✅ Connected! User count:', userCount);

        const clientCount = await prisma.client.count();
        console.log('✅ Client count:', clientCount);

        // Try to fetch one user
        const users = await prisma.user.findMany({ take: 1 });
        console.log('✅ Sample user:', users[0] || 'No users found');

    } catch (error) {
        console.error('❌ Connection failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testConnection();
