
/* eslint-disable no-console */
import 'dotenv/config';
import prisma from './src/lib/prisma';

async function main() {
    console.log('Testing connection via src/lib/prisma...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL);

    try {
        const count = await prisma.user.count();
        console.log('Successfully connected! User count:', count);
    } catch (e) {
        console.error('Connection failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
