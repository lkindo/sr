import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function testConnection() {
    try {
        console.log('🔍 Testing database connection and Resetting Admin Password...');
        console.log('Using DATABASE_URL:', process.env.DATABASE_URL);

        // 1. Connection Test
        const userCount = await prisma.user.count();
        console.log('✅ Connected! User count:', userCount);

        // 2. Admin Check & Update
        const email = 'admin@example.com';
        const adminUser = await prisma.user.findUnique({ where: { email } });

        if (adminUser) {
            console.log('✅ Admin found:', adminUser.email);

            // Generate hash for 'admin123'
            const hashedPassword = await bcrypt.hash("admin123", 10);

            await prisma.user.update({
                where: { email },
                data: { password: hashedPassword }
            });
            console.log('✅ Password updated to "admin123" successfully!');
        } else {
            console.log('❌ Admin not found');
        }

    } catch (error: any) {
        console.error('❌ Connection failed:', JSON.stringify(error, null, 2));
        console.error('Error Message:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

testConnection();
