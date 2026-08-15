-- AlterTable
ALTER TABLE "Plot" ADD COLUMN     "guardedUntil" TIMESTAMP(3),
ADD COLUMN     "waterCutMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wateredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MarketGood" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "saturation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketGood_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketGood_userId_idx" ON "MarketGood"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketGood_userId_itemKey_key" ON "MarketGood"("userId", "itemKey");

-- AddForeignKey
ALTER TABLE "MarketGood" ADD CONSTRAINT "MarketGood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
