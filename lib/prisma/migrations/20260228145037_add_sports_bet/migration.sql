-- CreateTable
CREATE TABLE "SportsBet" (
    "id" SERIAL NOT NULL,
    "keyword" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "SportsBet_pkey" PRIMARY KEY ("id")
);
