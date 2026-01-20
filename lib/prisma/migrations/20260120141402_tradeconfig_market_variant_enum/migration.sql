/*
  Warnings:

  - Changed the type of `marketVariant` on the `TradeConfig` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "MarketVariant" AS ENUM ('DEFAULT', 'SPORTS_MATCH', 'CRYPTO_UP_DOWN');

-- AlterTable
ALTER TABLE "TradeConfig" DROP COLUMN "marketVariant",
ADD COLUMN     "marketVariant" "MarketVariant" NOT NULL;
