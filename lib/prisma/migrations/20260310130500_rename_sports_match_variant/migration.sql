DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'MarketVariant'
      AND e.enumlabel = 'SPORTS_MATCH'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'MarketVariant'
      AND e.enumlabel = 'SPORTS_TEAM_MATCH'
  ) THEN
    ALTER TYPE "MarketVariant" RENAME VALUE 'SPORTS_MATCH' TO 'SPORTS_TEAM_MATCH';
  END IF;
END $$;
