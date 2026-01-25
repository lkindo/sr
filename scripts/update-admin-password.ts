import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@example.com';
  const password = 'admin123';

  console.log(`Checking user ${email}...`);

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (user) {
    console.log('✅ User found:', user.email);
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });
    console.log('✅ Password updated successfully!');
  } else {
    console.log('❌ User not found');
  }
}

main()
  .catch((e) => {
    console.error('Error details:', JSON.stringify(e, null, 2));
    console.error('Full error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
