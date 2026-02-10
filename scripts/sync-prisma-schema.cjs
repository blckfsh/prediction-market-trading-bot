const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const zmodelPath = path.join(repoRoot, 'lib', 'zenstack', 'schema.zmodel');
const prismaSchemaPath = path.join(repoRoot, 'lib', 'prisma', 'schema.prisma');

const zmodel = fs.readFileSync(zmodelPath, 'utf8');
fs.writeFileSync(prismaSchemaPath, zmodel, 'utf8');

console.log(`Synced Prisma schema from ${zmodelPath}.`);

