import { PrismaClient } from '@prisma/client';

// 환경 변수에서 URL 가져오기 (실제로는 .env에서 로드됨)
// 테스트를 위해 connection_limit=1과 pgbouncer=true를 강제로 추가하는 로직을 시뮬레이션
// 하지만 PrismaClient 생성자에는 직접 URL을 전달할 수 있음

async function testConnectionWithPoolSettings() {
    try {
        console.log('🔍 Testing database connection with pool settings...');

        // 기존 환경 변수의 URL을 가져와서 파라미터 추가
        // 주의: 실제 환경 변수 값을 알 수 없으므로, PrismaClient가 로드한 값을 사용할 수 있는지 확인
        // 여기서는 기본 PrismaClient를 생성하되, 로그를 통해 연결 상태 확인

        const prisma = new PrismaClient({
            log: ['query', 'info', 'warn', 'error'],
            datasources: {
                db: {
                    url: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes('?') ? '&' : '?') + 'connection_limit=1&pgbouncer=true'
                }
            }
        });

        console.log('🔌 Attempting connection with connection_limit=1&pgbouncer=true...');

        // Simple query to test connection
        const userCount = await prisma.user.count();
        console.log('✅ Connected! User count:', userCount);

        await prisma.$disconnect();

    } catch (error) {
        console.error('❌ Connection failed:', error);
    }
}

testConnectionWithPoolSettings();
