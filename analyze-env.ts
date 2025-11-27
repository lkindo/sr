import { config } from 'dotenv';
config();

function analyzeUrl(name: string, url: string | undefined) {
    console.log(`\n🔍 Analyzing ${name}:`);
    if (!url) {
        console.log('   ❌ Undefined');
        return;
    }

    try {
        // URL 객체로 파싱 시도 (비밀번호 마스킹)
        const maskedUrl = url.replace(/:([^:@]+)@/, ':****@');
        console.log(`   - Raw (Masked): ${maskedUrl}`);

        // 정규식으로 파싱
        const match = url.match(/(postgresql:\/\/)([^:]+):([^@]+)@([^:]+):(\d+)(\/.*)/);
        if (!match) {
            console.log('   ❌ Invalid format');
            return;
        }

        const [_, protocol, user, pass, host, port, rest] = match;
        console.log(`   - Host: ${host}`);
        console.log(`   - Port: ${port}`);

        // 파라미터 분석
        const [path, query] = rest.split('?');
        console.log(`   - Path: ${path}`);
        console.log(`   - Query Params: ${query || 'None'}`);

        if (port === '5432') {
            if (!query || !query.includes('pgbouncer=true')) {
                console.log('   ⚠️  WARNING: Port 5432 requires ?pgbouncer=true');
            } else {
                console.log('   ✅ Port 5432 with pgbouncer=true (Correct for Transaction Pooler)');
            }
        } else if (port === '6543') {
            console.log('   ✅ Port 6543 (Correct for Session Pooler / Direct)');
            if (query && query.includes('pgbouncer=true')) {
                console.log('   ℹ️  Note: pgbouncer=true is usually not needed for port 6543');
            }
        } else {
            console.log(`   ⚠️  Unknown port: ${port}`);
        }

    } catch (e) {
        console.log('   ❌ Error parsing URL:', e);
    }
}

console.log('Environment Variable Analysis');
console.log('=============================');
analyzeUrl('DATABASE_URL', process.env.DATABASE_URL);
analyzeUrl('DIRECT_URL', process.env.DIRECT_URL);
