
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAttachments() {
  try {
    console.log('Checking SR Attachments...');
    
    // 1. Count total attachments
    const totalAttachments = await prisma.sRAttachment.count();
    console.log(`Total Attachments in DB: ${totalAttachments}`);

    // 2. Get recent attachments with SR info
    const recentAttachments = await prisma.sRAttachment.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        sr: {
          select: {
            srNumber: true,
            title: true
          }
        }
      }
    });

    console.log('\nRecent Attachments:');
    recentAttachments.forEach(att => {
      console.log(`- File: ${att.fileName} (${att.fileSize} bytes)`);
      console.log(`  SR: ${att.sr.srNumber} - ${att.sr.title}`);
      console.log(`  URL: ${att.fileUrl}`);
      console.log(`  Path: ${att.storagePath}`);
    });

    // 3. Check SRs with attachments count
    const srsWithAttachments = await prisma.sR.findMany({
      where: {
        attachments: {
          some: {}
        }
      },
      take: 5,
      include: {
        _count: {
          select: { attachments: true }
        },
        attachments: true
      }
    });

    console.log('\nSRs with Attachments (DB Check):');
    srsWithAttachments.forEach(sr => {
      console.log(`- SR: ${sr.srNumber}`);
      console.log(`  Count field: ${sr._count.attachments}`);
      console.log(`  Actual array length: ${sr.attachments.length}`);
    });

  } catch (error) {
    console.error('Error checking attachments:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAttachments();
