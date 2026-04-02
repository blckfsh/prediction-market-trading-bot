-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BuyTradeType') THEN
    CREATE TYPE "BuyTradeType" AS ENUM ('YES', 'NO', 'AVG_PRICE', 'NA');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SlugMatchType') THEN
    CREATE TYPE "SlugMatchType" AS ENUM ('PREFIX', 'SUFFIX', 'REGEX');
  END IF;
END $$;

-- Market profile parent table
CREATE TABLE IF NOT EXISTS "MarketProfile" (
  "id" SERIAL NOT NULL,
  "marketVariant" "MarketVariant" NOT NULL,
  "configKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketProfile_marketVariant_configKey_key"
ON "MarketProfile"("marketVariant", "configKey");

-- Trade shape improvements
ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "marketSlug" TEXT;
ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "outcomeOnChainId" TEXT;
CREATE INDEX IF NOT EXISTS "Trade_marketId_status_buyTimestamp_idx"
ON "Trade"("marketId", "status", "buyTimestamp");

-- BuyPositionConfig migration
ALTER TABLE "BuyPositionConfig" ADD COLUMN IF NOT EXISTS "marketProfileId" INTEGER;
ALTER TABLE "BuyPositionConfig" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "BuyPositionConfig" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "BuyPositionConfig" ADD COLUMN IF NOT EXISTS "tradeTypeV2" "BuyTradeType" NOT NULL DEFAULT 'AVG_PRICE';

INSERT INTO "MarketProfile" ("marketVariant", "configKey")
SELECT DISTINCT "marketVariant", "slugWithSuffix" FROM "BuyPositionConfig"
ON CONFLICT ("marketVariant", "configKey") DO NOTHING;

UPDATE "BuyPositionConfig" b
SET "marketProfileId" = p."id"
FROM "MarketProfile" p
WHERE p."marketVariant" = b."marketVariant"
  AND p."configKey" = b."slugWithSuffix";

UPDATE "BuyPositionConfig"
SET "tradeTypeV2" =
  CASE LOWER(COALESCE("tradeType", 'avg-price'))
    WHEN 'yes' THEN 'YES'::"BuyTradeType"
    WHEN 'no' THEN 'NO'::"BuyTradeType"
    WHEN 'na' THEN 'NA'::"BuyTradeType"
    WHEN 'greater-than-no' THEN 'YES'::"BuyTradeType"
    WHEN 'less-than-no' THEN 'NO'::"BuyTradeType"
    ELSE 'AVG_PRICE'::"BuyTradeType"
  END;

ALTER TABLE "BuyPositionConfig"
  ALTER COLUMN "marketProfileId" SET NOT NULL;

ALTER TABLE "BuyPositionConfig" DROP COLUMN IF EXISTS "tradeType";
ALTER TABLE "BuyPositionConfig" RENAME COLUMN "tradeTypeV2" TO "tradeType";
ALTER TABLE "BuyPositionConfig" DROP COLUMN IF EXISTS "marketVariant";
ALTER TABLE "BuyPositionConfig" DROP COLUMN IF EXISTS "slugWithSuffix";

CREATE UNIQUE INDEX IF NOT EXISTS "BuyPositionConfig_marketProfileId_key"
ON "BuyPositionConfig"("marketProfileId");

ALTER TABLE "BuyPositionConfig"
  ADD CONSTRAINT "BuyPositionConfig_marketProfileId_fkey"
  FOREIGN KEY ("marketProfileId") REFERENCES "MarketProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SellPositionConfig migration
ALTER TABLE "SellPositionConfig" ADD COLUMN IF NOT EXISTS "marketProfileId" INTEGER;
ALTER TABLE "SellPositionConfig" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SellPositionConfig" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

INSERT INTO "MarketProfile" ("marketVariant", "configKey")
SELECT DISTINCT "marketVariant", "slugWithSuffix" FROM "SellPositionConfig"
ON CONFLICT ("marketVariant", "configKey") DO NOTHING;

UPDATE "SellPositionConfig" s
SET "marketProfileId" = p."id"
FROM "MarketProfile" p
WHERE p."marketVariant" = s."marketVariant"
  AND p."configKey" = s."slugWithSuffix";

ALTER TABLE "SellPositionConfig"
  ALTER COLUMN "marketProfileId" SET NOT NULL;

ALTER TABLE "SellPositionConfig" DROP COLUMN IF EXISTS "marketVariant";
ALTER TABLE "SellPositionConfig" DROP COLUMN IF EXISTS "slugWithSuffix";

CREATE UNIQUE INDEX IF NOT EXISTS "SellPositionConfig_marketProfileId_key"
ON "SellPositionConfig"("marketProfileId");

ALTER TABLE "SellPositionConfig"
  ADD CONSTRAINT "SellPositionConfig_marketProfileId_fkey"
  FOREIGN KEY ("marketProfileId") REFERENCES "MarketProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SportsBet migration
ALTER TABLE "SportsBet" ADD COLUMN IF NOT EXISTS "marketProfileId" INTEGER;
ALTER TABLE "SportsBet" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SportsBet" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

INSERT INTO "MarketProfile" ("marketVariant", "configKey")
SELECT DISTINCT 'SPORTS_TEAM_MATCH'::"MarketVariant", "category" FROM "SportsBet"
ON CONFLICT ("marketVariant", "configKey") DO NOTHING;

UPDATE "SportsBet" sb
SET "marketProfileId" = p."id"
FROM "MarketProfile" p
WHERE p."marketVariant" = 'SPORTS_TEAM_MATCH'::"MarketVariant"
  AND p."configKey" = sb."category";

ALTER TABLE "SportsBet"
  ALTER COLUMN "marketProfileId" SET NOT NULL;

ALTER TABLE "SportsBet"
  ADD CONSTRAINT "SportsBet_marketProfileId_fkey"
  FOREIGN KEY ("marketProfileId") REFERENCES "MarketProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "SportsBet_marketProfileId_category_keyword_key"
ON "SportsBet"("marketProfileId", "category", "keyword");

-- SlugMatchRule migration
ALTER TABLE "SlugMatchRule" ADD COLUMN IF NOT EXISTS "marketProfileId" INTEGER;
ALTER TABLE "SlugMatchRule" ADD COLUMN IF NOT EXISTS "matchTypeV2" "SlugMatchType" NOT NULL DEFAULT 'SUFFIX';

INSERT INTO "MarketProfile" ("marketVariant", "configKey")
SELECT DISTINCT
  COALESCE("marketVariant", 'CRYPTO_UP_DOWN'::"MarketVariant"),
  "configKey"
FROM "SlugMatchRule"
ON CONFLICT ("marketVariant", "configKey") DO NOTHING;

UPDATE "SlugMatchRule" r
SET "marketProfileId" = p."id"
FROM "MarketProfile" p
WHERE p."marketVariant" = COALESCE(r."marketVariant", 'CRYPTO_UP_DOWN'::"MarketVariant")
  AND p."configKey" = r."configKey";

UPDATE "SlugMatchRule"
SET "matchTypeV2" =
  CASE LOWER(COALESCE("matchType", 'suffix'))
    WHEN 'prefix' THEN 'PREFIX'::"SlugMatchType"
    WHEN 'regex' THEN 'REGEX'::"SlugMatchType"
    ELSE 'SUFFIX'::"SlugMatchType"
  END;

ALTER TABLE "SlugMatchRule"
  ALTER COLUMN "marketProfileId" SET NOT NULL;

DROP INDEX IF EXISTS "SlugMatchRule_marketVariant_configKey_matchType_pattern_key";
ALTER TABLE "SlugMatchRule" DROP COLUMN IF EXISTS "marketVariant";
ALTER TABLE "SlugMatchRule" DROP COLUMN IF EXISTS "configKey";
ALTER TABLE "SlugMatchRule" DROP COLUMN IF EXISTS "matchType";
ALTER TABLE "SlugMatchRule" RENAME COLUMN "matchTypeV2" TO "matchType";

ALTER TABLE "SlugMatchRule"
  ADD CONSTRAINT "SlugMatchRule_marketProfileId_fkey"
  FOREIGN KEY ("marketProfileId") REFERENCES "MarketProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "SlugMatchRule_marketProfileId_matchType_pattern_key"
ON "SlugMatchRule"("marketProfileId", "matchType", "pattern");

-- Data checks
ALTER TABLE "BuyPositionConfig"
  ADD CONSTRAINT "BuyPositionConfig_amount_check" CHECK ("amount" > 0);
ALTER TABLE "BuyPositionConfig"
  ADD CONSTRAINT "BuyPositionConfig_entry_check" CHECK ("entry" >= 0);
ALTER TABLE "SellPositionConfig"
  ADD CONSTRAINT "SellPositionConfig_stopLossPercentage_check" CHECK ("stopLossPercentage" >= 0 AND "stopLossPercentage" <= 100);
ALTER TABLE "SellPositionConfig"
  ADD CONSTRAINT "SellPositionConfig_amountPercentage_check" CHECK ("amountPercentage" > 0 AND "amountPercentage" <= 100);
ALTER TABLE "SlugMatchRule"
  ADD CONSTRAINT "SlugMatchRule_priority_check" CHECK ("priority" >= 0);
