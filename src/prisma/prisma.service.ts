import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const connectionString =
      process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'Set DIRECT_DATABASE_URL or DATABASE_URL before using PrismaService',
      );
    }

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({ adapter });
  }
}
