/* eslint-disable no-console */
import { config } from 'dotenv';
config();

function maskPassword(url: string | undefined) {
    if (!url) return 'UNDEFINED';
    try {
        // postgresql://user:password@host:port/db
        const match = url.match(/(postgresql:\/\/)([^:]+):([^@]+)@([^:]+):(\d+)(\/.*)/);
        if (match) {
            const [_, protocol, user, _pass, host, port, rest] = match;
            return `${protocol}${user}:****@${host}:${port}${rest}`;
        }
        return 'INVALID_FORMAT';
    } catch {
        return 'ERROR_PARSING';
    }
}

console.log('🔍 Environment Variable Diagnosis:');
console.log('--------------------------------');

const dbUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL;

console.log(`1. DATABASE_URL: ${maskPassword(dbUrl)}`);
if (dbUrl) {
    console.log(`   - Host: ${dbUrl.split('@')[1]?.split(':')[0]}`);
    console.log(`   - Port: ${dbUrl.split(':')[3]?.split('/')[0]}`);
    console.log(`   - Params: ${dbUrl.split('?')[1] || 'None'}`);
}

console.log(`\n2. DIRECT_URL:   ${maskPassword(directUrl)}`);
if (directUrl) {
    console.log(`   - Host: ${directUrl.split('@')[1]?.split(':')[0]}`);
    console.log(`   - Port: ${directUrl.split(':')[3]?.split('/')[0]}`);
}

console.log('\n3. Check Points:');
if (dbUrl && directUrl) {
    const dbPort = dbUrl.split(':')[3]?.split('/')[0];
    const directPort = directUrl.split(':')[3]?.split('/')[0];

    if (dbPort === '5432' && !dbUrl.includes('pgbouncer=true')) {
        console.log('   ⚠️  WARNING: Port 5432 used without pgbouncer=true in DATABASE_URL');
    }

    if (dbPort === directPort) {
        console.log('   ⚠️  WARNING: DATABASE_URL and DIRECT_URL are using the same port. Usually DIRECT_URL uses 6543.');
    }
}
