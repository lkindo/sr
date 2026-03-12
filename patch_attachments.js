const fs = require('fs');
const filepath = 'src/app/api/attachments/route.ts';

let content = fs.readFileSync(filepath, 'utf8');

content = content.replace(
  "import { BadRequestError, NotFoundError } from '@/lib/errors';",
  "import { BadRequestError, NotFoundError } from '@/lib/errors';\nimport { ensureCanUpdateSR } from '@/lib/policies';"
);

content = content.replace(
  /const sr = await prisma\.sR\.findUnique\(\{\s+where: \{ id: srId \},\s+select: \{ id: true, requesterId: true, assigneeId: true \},\s+\}\);/,
  'const sr = await prisma.sR.findUnique({\n      where: { id: srId },\n    });'
);

content = content.replace(
  /if \(!sr\) \{\s+throw new NotFoundError\('SR'\);\s+\}/,
  "if (!sr) {\n      throw new NotFoundError('SR');\n    }\n\n    // 권한 체크: SR을 수정할 수 있는 권한이 있어야 첨부파일 추가 가능\n    ensureCanUpdateSR(session.user, sr);"
);

fs.writeFileSync(filepath, content);
console.log('Patched route.ts');
