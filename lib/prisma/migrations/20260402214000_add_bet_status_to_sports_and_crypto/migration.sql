DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BetStatus') THEN
    CREATE TYPE "BetStatus" AS ENUM ('ACTIVE', 'INACTIVE');
  END IF;
END $$;

ALTER TABLE "SportsBet"
  ADD COLUMN IF NOT EXISTS "status" "BetStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "SlugMatchRule"
  ADD COLUMN IF NOT EXISTS "status" "BetStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "SportsBet"
SET "status" = 'ACTIVE'
WHERE "status" IS NULL;

UPDATE "SlugMatchRule"
SET "status" = 'ACTIVE'
WHERE "status" IS NULL;
