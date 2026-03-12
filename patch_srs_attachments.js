const fs = require('fs');
const filepath = 'src/app/api/srs/[id]/attachments/route.ts';

let content = fs.readFileSync(filepath, 'utf8');

content = content.replace(
  "import { FileValidationError, validateFile } from '@/lib/file-validator';\nimport prisma from '@/lib/prisma';",
  "import { FileValidationError, validateFile } from '@/lib/file-validator';\nimport { ensureCanReadSR, ensureCanUpdateSR } from '@/lib/policies';\nimport prisma from '@/lib/prisma';"
);

content = content.replace(
  /if \(!sr\) \{\s+throw new NotFoundError\('SR'\);\s+\}/,
  "if (!sr) {\n      throw new NotFoundError('SR');\n    }\n\n    // 권한 체크: SR을 수정할 수 있는 권한이 있어야 첨부파일 추가 가능\n    ensureCanUpdateSR(session.user, sr);"
);

content = content.replace(
  /export const GET = withAuthAndRateLimit\(\n {2}async \(\n {4}req: NextRequest,\n {4}\{ params \}: AuthenticatedContext<RouteContext<\{ id: string \}>\['params'\]>\n {2}\) => \{/,
  "export const GET = withAuthAndRateLimit(\n  async (\n    req: NextRequest,\n    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>\n  ) => {"
);

content = content.replace(
  /const \{ id: srId \} = await params;\n\n {4}const attachments = await prisma\.sRAttachment\.findMany\(\{/,
  "const { id: srId } = await params;\n\n    // SR 존재 확인 및 권한 체크\n    const sr = await prisma.sR.findUnique({\n      where: { id: srId },\n    });\n\n    if (!sr) {\n      throw new NotFoundError('SR');\n    }\n\n    ensureCanReadSR(session.user, sr);\n\n    const attachments = await prisma.sRAttachment.findMany({"
);

fs.writeFileSync(filepath, content);
console.log('Patched srs_attachments route.ts');
