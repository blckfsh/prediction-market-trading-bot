-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('BOUGHT', 'SOLD');

-- CreateTable
CREATE TABLE "Trade" (
    "id" SERIAL NOT NULL,
    "marketId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "status" "TradeStatus" NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);
