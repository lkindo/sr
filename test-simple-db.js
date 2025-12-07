require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});

async function main() {
    console.log('Testing with URL:', process.env.DATABASE_URL);
    try {
        const count = await prisma.user.count();
        console.log('Connected! User count:', count);
    } catch (e) {
        console.log('Failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
