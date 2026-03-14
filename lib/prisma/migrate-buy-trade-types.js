require('dotenv/config');
const { Client } = require('pg');

async function main() {
  const connectionString =
    process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'Missing DIRECT_DATABASE_URL (or DATABASE_URL) in environment.',
    );
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const before = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE LOWER("tradeType") = 'greater-than-no')::int AS greater_than_no,
        COUNT(*) FILTER (WHERE LOWER("tradeType") = 'less-than-no')::int AS less_than_no,
        COUNT(*) FILTER (WHERE "marketVariant" = 'SPORTS_TEAM_MATCH' AND ("tradeType" IS NULL OR BTRIM("tradeType") = ''))::int AS sports_missing,
        COUNT(*) FILTER (WHERE "marketVariant" <> 'SPORTS_TEAM_MATCH' AND ("tradeType" IS NULL OR BTRIM("tradeType") = ''))::int AS non_sports_missing
      FROM "BuyPositionConfig";
    `);

    await client.query('BEGIN');

    const legacyYes = await client.query(`
      UPDATE "BuyPositionConfig"
      SET "tradeType" = 'yes'
      WHERE LOWER("tradeType") = 'greater-than-no';
    `);

    const legacyNo = await client.query(`
      UPDATE "BuyPositionConfig"
      SET "tradeType" = 'no'
      WHERE LOWER("tradeType") = 'less-than-no';
    `);

    const sportsDefault = await client.query(`
      UPDATE "BuyPositionConfig"
      SET "tradeType" = 'na'
      WHERE "marketVariant" = 'SPORTS_TEAM_MATCH'
        AND ("tradeType" IS NULL OR BTRIM("tradeType") = '');
    `);

    const nonSportsDefault = await client.query(`
      UPDATE "BuyPositionConfig"
      SET "tradeType" = 'avg-price'
      WHERE "marketVariant" <> 'SPORTS_TEAM_MATCH'
        AND ("tradeType" IS NULL OR BTRIM("tradeType") = '');
    `);

    await client.query('COMMIT');

    const after = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "tradeType" = 'yes')::int AS yes_count,
        COUNT(*) FILTER (WHERE "tradeType" = 'no')::int AS no_count,
        COUNT(*) FILTER (WHERE "tradeType" = 'avg-price')::int AS avg_price_count,
        COUNT(*) FILTER (WHERE "tradeType" = 'na')::int AS na_count
      FROM "BuyPositionConfig";
    `);

    console.log('Migration completed for BuyPositionConfig.tradeType');
    console.log('Before:', before.rows[0]);
    console.log('Updated legacy greater-than-no -> yes:', legacyYes.rowCount);
    console.log('Updated legacy less-than-no -> no:', legacyNo.rowCount);
    console.log('Filled SPORTS_TEAM_MATCH missing -> na:', sportsDefault.rowCount);
    console.log(
      'Filled non-SPORTS_TEAM_MATCH missing -> avg-price:',
      nonSportsDefault.rowCount,
    );
    console.log('After:', after.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration failed: ${message}`);
  process.exit(1);
});
