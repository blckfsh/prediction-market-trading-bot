require('dotenv/config');

const { Test } = require('@nestjs/testing');
const { PrismaClient } = require('../generated/prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

describe('Database connectivity', () => {
  let moduleRef;
  let pool;
  let prisma;

  beforeAll(async () => {
    const connectionString =
      process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'Set DIRECT_DATABASE_URL or DATABASE_URL before running this test'
      );
    }

    moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: Pool,
          useFactory: () => new Pool({ connectionString }),
        },
        {
          provide: PrismaClient,
          useFactory: (p) => {
            const adapter = new PrismaPg(p);
            return new PrismaClient({ adapter });
          },
          inject: [Pool],
        },
      ],
    }).compile();

    pool = moduleRef.get(Pool);
    prisma = moduleRef.get(PrismaClient);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    await moduleRef?.close();
  });

  it('connects and returns SELECT 1', async () => {
    const result = await prisma.$queryRaw`SELECT 1 AS ok`;
    expect(result?.[0]?.ok).toBe(1);
  });
});

