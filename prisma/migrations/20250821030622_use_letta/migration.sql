/*
  Warnings:

  - You are about to drop the `memories` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[agentId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_userId_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "agentId" TEXT;

-- DropTable
DROP TABLE "memories";

-- CreateIndex
CREATE UNIQUE INDEX "users_agentId_key" ON "users"("agentId");
