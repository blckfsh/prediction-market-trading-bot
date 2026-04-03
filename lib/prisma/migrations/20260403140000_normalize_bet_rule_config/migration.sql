DROP TABLE IF EXISTS "SportsBet";

DROP TABLE IF EXISTS "SlugMatchRule";

CREATE TABLE "BetRuleConfig" (
  "id" SERIAL NOT NULL,
  "amount" INTEGER NOT NULL,
  "profitTakingPercentage" INTEGER,
  "status" "BetStatus" NOT NULL DEFAULT 'ACTIVE',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BetRuleConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SportsBet" (
  "id" SERIAL NOT NULL,
  "marketProfileId" INTEGER NOT NULL,
  "betRuleConfigId" INTEGER NOT NULL,
  "keyword" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SportsBet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SportsBet_betRuleConfigId_key"
  ON "SportsBet"("betRuleConfigId");

CREATE UNIQUE INDEX "SportsBet_marketProfileId_category_keyword_key"
  ON "SportsBet"("marketProfileId", "category", "keyword");

CREATE TABLE "SlugMatchRule" (
  "id" SERIAL NOT NULL,
  "marketProfileId" INTEGER NOT NULL,
  "betRuleConfigId" INTEGER NOT NULL,
  "matchType" "SlugMatchType" NOT NULL,
  "pattern" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlugMatchRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SlugMatchRule_betRuleConfigId_key"
  ON "SlugMatchRule"("betRuleConfigId");

CREATE UNIQUE INDEX "SlugMatchRule_marketProfileId_matchType_pattern_key"
  ON "SlugMatchRule"("marketProfileId", "matchType", "pattern");

CREATE INDEX "SlugMatchRule_enabled_betRuleConfigId_idx"
  ON "SlugMatchRule"("enabled", "betRuleConfigId");

ALTER TABLE "SportsBet"
  ADD CONSTRAINT "SportsBet_marketProfileId_fkey"
  FOREIGN KEY ("marketProfileId")
  REFERENCES "MarketProfile"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "SportsBet"
  ADD CONSTRAINT "SportsBet_betRuleConfigId_fkey"
  FOREIGN KEY ("betRuleConfigId")
  REFERENCES "BetRuleConfig"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "SlugMatchRule"
  ADD CONSTRAINT "SlugMatchRule_marketProfileId_fkey"
  FOREIGN KEY ("marketProfileId")
  REFERENCES "MarketProfile"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "SlugMatchRule"
  ADD CONSTRAINT "SlugMatchRule_betRuleConfigId_fkey"
  FOREIGN KEY ("betRuleConfigId")
  REFERENCES "BetRuleConfig"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
