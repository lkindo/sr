/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

// 환경 변수에서 URL 가져와서 포트만 6543으로 변경하여 테스트
async function testDirectConnection() {
    try {
        console.log('🔍 Testing DIRECT connection (Port 6543)...');

        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            console.error('❌ DATABASE_URL is undefined');
            return;
        }

        // 포트를 5432 -> 6543으로 변경
        const directUrl = dbUrl.replace(':5432', ':6543');

        console.log('🔌 Attempting connection to Port 6543...');

        const prisma = new PrismaClient({
            datasources: {
                db: {
                    url: directUrl
                }
            }
        });

        const userCount = await prisma.user.count();
        console.log('✅ Connected to Port 6543! User count:', userCount);

        await prisma.$disconnect();

    } catch (error) {
        console.error('❌ Connection failed:', error);
    }
}

testDirectConnection();
