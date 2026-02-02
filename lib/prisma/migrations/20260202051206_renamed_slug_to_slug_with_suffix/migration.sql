/*
  Warnings:

  - You are about to drop the column `slug` on the `SlugEnabled` table. All the data in the column will be lost.
  - Added the required column `slugWithSuffix` to the `SlugEnabled` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SlugEnabled" DROP COLUMN "slug",
ADD COLUMN     "slugWithSuffix" TEXT NOT NULL;
