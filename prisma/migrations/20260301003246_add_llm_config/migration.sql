-- CreateEnum
CREATE TYPE "LlmProvider" AS ENUM ('ANTHROPIC', 'GOOGLE_GEMINI', 'PLATFORM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "activeLlmProvider" "LlmProvider";

-- CreateTable
CREATE TABLE "llm_configs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" "LlmProvider" NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_configs_userId_provider_key" ON "llm_configs"("userId", "provider");

-- AddForeignKey
ALTER TABLE "llm_configs" ADD CONSTRAINT "llm_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
