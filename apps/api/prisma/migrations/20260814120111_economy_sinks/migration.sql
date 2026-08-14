-- AlterTable
ALTER TABLE "User" ADD COLUMN     "craftCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fishCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Upgrade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Upgrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "baseline" JSONB NOT NULL,
    "claimed" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastCompleteDay" INTEGER NOT NULL DEFAULT -1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Upgrade_userId_idx" ON "Upgrade"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Upgrade_userId_key_key" ON "Upgrade"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DailyState_userId_key" ON "DailyState"("userId");

-- CreateIndex
CREATE INDEX "DailyState_userId_idx" ON "DailyState"("userId");

-- AddForeignKey
ALTER TABLE "Upgrade" ADD CONSTRAINT "Upgrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyState" ADD CONSTRAINT "DailyState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
