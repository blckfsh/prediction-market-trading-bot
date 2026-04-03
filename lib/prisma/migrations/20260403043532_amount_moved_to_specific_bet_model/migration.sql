-- AlterTable
ALTER TABLE "BuyPositionConfig" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SellPositionConfig" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SlugMatchRule" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "matchType" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SportsBet" ALTER COLUMN "updatedAt" DROP DEFAULT;
