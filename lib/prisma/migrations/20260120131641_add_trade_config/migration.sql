-- CreateEnum
CREATE TYPE "TradeOptions" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "TradeConfig" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "options" "TradeOptions" NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "TradeConfig_pkey" PRIMARY KEY ("id")
);
