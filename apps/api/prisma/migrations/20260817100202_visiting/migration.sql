-- AlterTable
ALTER TABLE "User" ADD COLUMN     "visitSlug" TEXT;

-- CreateTable
CREATE TABLE "GuestbookEntry" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestbookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestbookEntry_ownerId_createdAt_idx" ON "GuestbookEntry"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_visitSlug_key" ON "User"("visitSlug");

-- AddForeignKey
ALTER TABLE "GuestbookEntry" ADD CONSTRAINT "GuestbookEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

