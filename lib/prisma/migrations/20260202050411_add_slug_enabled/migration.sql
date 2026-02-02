-- CreateTable
CREATE TABLE "SlugEnabled" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "entry" INTEGER NOT NULL,

    CONSTRAINT "SlugEnabled_pkey" PRIMARY KEY ("id")
);
