CREATE TABLE IF NOT EXISTS "SlugMatchRule" (
  "id" SERIAL NOT NULL,
  "marketVariant" "MarketVariant",
  "configKey" TEXT NOT NULL,
  "matchType" TEXT NOT NULL,
  "pattern" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SlugMatchRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SlugMatchRule_marketVariant_configKey_matchType_pattern_key"
ON "SlugMatchRule"("marketVariant", "configKey", "matchType", "pattern");

CREATE INDEX IF NOT EXISTS "SlugMatchRule_enabled_priority_idx"
ON "SlugMatchRule"("enabled", "priority");
