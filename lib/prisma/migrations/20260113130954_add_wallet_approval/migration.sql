-- CreateTable
CREATE TABLE "WalletApproval" (
    "id" SERIAL NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletApproval_pkey" PRIMARY KEY ("id")
);
