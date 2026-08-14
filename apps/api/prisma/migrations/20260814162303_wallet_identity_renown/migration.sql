-- AlterTable
ALTER TABLE "Expansion" ADD COLUMN     "east" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "renown" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "upgradesBought" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "User_renown_idx" ON "User"("renown");

-- CreateIndex
CREATE INDEX "User_xp_idx" ON "User"("xp");
