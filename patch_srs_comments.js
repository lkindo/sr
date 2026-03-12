const fs = require('fs');
const filepath = 'src/app/api/srs/[id]/comments/route.ts';

let content = fs.readFileSync(filepath, 'utf8');

content = content.replace(
  "import { NotFoundError, ValidationError } from '@/lib/errors';\nimport prisma from '@/lib/prisma';",
  "import { NotFoundError, ValidationError } from '@/lib/errors';\nimport { ensureCanReadSR } from '@/lib/policies';\nimport prisma from '@/lib/prisma';"
);

content = content.replace(
  /export const GET = withAuthAndRateLimit\(\n {2}async \(\n {4}_request: NextRequest,\n {4}\{ params \}: AuthenticatedContext<RouteContext<\{ id: string \}>\['params'\]>\n {2}\) => \{/,
  "export const GET = withAuthAndRateLimit(\n  async (\n    _request: NextRequest,\n    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>\n  ) => {"
);

content = content.replace(
  /const \{ id \} = await params;\n\n {4}const comments = await prisma\.sRComment\.findMany\(\{/,
  "const { id } = await params;\n\n    const sr = await prisma.sR.findUnique({ where: { id } });\n    if (!sr) throw new NotFoundError('SR');\n\n    ensureCanReadSR(session.user, sr);\n\n    const comments = await prisma.sRComment.findMany({"
);

content = content.replace(
  /select: \{\n {8}id: true,\n {8}srNumber: true,\n {8}title: true,\n {8}requester: \{\n {10}select: \{\n {12}id: true,\n {12}email: true,\n {12}notificationPreference: true,\n {10}\},\n {8}\},\n        assignee: \{\n          select: \{\n            id: true,\n            email: true,\n            notificationPreference: true,\n          \},\n        \},\n      \},/,
  'include: {\n        requester: {\n          select: {\n            id: true,\n            email: true,\n            notificationPreference: true,\n          },\n        },\n        assignee: {\n          select: {\n            id: true,\n            email: true,\n            notificationPreference: true,\n          },\n        },\n      },'
);

content = content.replace(
  /if \(!sr\) \{\s+throw new NotFoundError\('SR'\);\s+\}/,
  "if (!sr) {\n      throw new NotFoundError('SR');\n    }\n\n    ensureCanReadSR(session.user, sr);"
);

fs.writeFileSync(filepath, content);
console.log('Patched srs_comments route.ts');
