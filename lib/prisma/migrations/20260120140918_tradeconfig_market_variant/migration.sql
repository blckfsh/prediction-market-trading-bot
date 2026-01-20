/*
  Warnings:

  - You are about to drop the column `slug` on the `TradeConfig` table. All the data in the column will be lost.
  - Added the required column `marketVariant` to the `TradeConfig` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TradeConfig" DROP COLUMN "slug",
ADD COLUMN     "marketVariant" TEXT NOT NULL;
