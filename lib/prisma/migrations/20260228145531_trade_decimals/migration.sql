/*
  Warnings:

  - You are about to drop the column `amount` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `Trade` table. All the data in the column will be lost.
  - Added the required column `buyAmount` to the `Trade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `buyAmountInUsd` to the `Trade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `buyTimestamp` to the `Trade` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "amount",
DROP COLUMN "timestamp",
ADD COLUMN     "buyAmount" INTEGER NOT NULL,
ADD COLUMN     "buyAmountInUsd" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "buyTimestamp" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "profitOrLossInUsd" DECIMAL(65,30),
ADD COLUMN     "sellAmount" INTEGER,
ADD COLUMN     "sellAmountInUsd" DECIMAL(65,30),
ADD COLUMN     "sellTimestamp" TIMESTAMP(3);
