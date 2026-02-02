-- DropTable
DROP TABLE "TradeConfig";

-- CreateTable
CREATE TABLE "BuyPositionConfig" (
    "id" SERIAL NOT NULL,
    "marketVariant" "MarketVariant" NOT NULL,
    "slugWithSuffix" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "entry" INTEGER NOT NULL,

    CONSTRAINT "BuyPositionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellPositionConfig" (
    "id" SERIAL NOT NULL,
    "marketVariant" "MarketVariant" NOT NULL,
    "slugWithSuffix" TEXT NOT NULL,
    "stopLossPercentage" INTEGER NOT NULL,
    "amountPercentage" INTEGER NOT NULL,

    CONSTRAINT "SellPositionConfig_pkey" PRIMARY KEY ("id")
);
