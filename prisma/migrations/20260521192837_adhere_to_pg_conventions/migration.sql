/*
  Warnings:

  - The primary key for the `entity_edges` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `source_uuid` on the `entity_edges` table. All the data in the column will be lost.
  - You are about to drop the column `target_uuid` on the `entity_edges` table. All the data in the column will be lost.
  - You are about to drop the column `uuid` on the `entity_edges` table. All the data in the column will be lost.
  - The primary key for the `entity_nodes` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `uuid` on the `entity_nodes` table. All the data in the column will be lost.
  - The primary key for the `episodic_edges` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `entity_uuid` on the `episodic_edges` table. All the data in the column will be lost.
  - You are about to drop the column `episodic_uuid` on the `episodic_edges` table. All the data in the column will be lost.
  - You are about to drop the column `uuid` on the `episodic_edges` table. All the data in the column will be lost.
  - The primary key for the `episodic_nodes` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `uuid` on the `episodic_nodes` table. All the data in the column will be lost.
  - The primary key for the `has_episode_edges` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `episodic_uuid` on the `has_episode_edges` table. All the data in the column will be lost.
  - You are about to drop the column `saga_uuid` on the `has_episode_edges` table. All the data in the column will be lost.
  - You are about to drop the column `uuid` on the `has_episode_edges` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `llm_configs` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `llm_configs` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `llm_configs` table. All the data in the column will be lost.
  - The primary key for the `saga_nodes` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `uuid` on the `saga_nodes` table. All the data in the column will be lost.
  - You are about to drop the column `activeLlmProvider` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `passwordHash` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `users` table. All the data in the column will be lost.
  - The `role` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[user_id,provider]` on the table `llm_configs` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `id` to the `entity_edges` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source_id` to the `entity_edges` table without a default value. This is not possible if the table is not empty.
  - Added the required column `target_id` to the `entity_edges` table without a default value. This is not possible if the table is not empty.
  - Added the required column `id` to the `entity_nodes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entity_id` to the `episodic_edges` table without a default value. This is not possible if the table is not empty.
  - Added the required column `episodic_id` to the `episodic_edges` table without a default value. This is not possible if the table is not empty.
  - Added the required column `id` to the `episodic_edges` table without a default value. This is not possible if the table is not empty.
  - Added the required column `id` to the `episodic_nodes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `episodic_id` to the `has_episode_edges` table without a default value. This is not possible if the table is not empty.
  - Added the required column `id` to the `has_episode_edges` table without a default value. This is not possible if the table is not empty.
  - Added the required column `saga_id` to the `has_episode_edges` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `llm_configs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `llm_configs` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `provider` on the `llm_configs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `id` to the `saga_nodes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password_hash` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "llm_provider" AS ENUM ('ANTHROPIC', 'GOOGLE_GEMINI', 'PLATFORM');

-- DropForeignKey
ALTER TABLE "entity_edges" DROP CONSTRAINT "entity_edges_source_uuid_fkey";

-- DropForeignKey
ALTER TABLE "entity_edges" DROP CONSTRAINT "entity_edges_target_uuid_fkey";

-- DropForeignKey
ALTER TABLE "episodic_edges" DROP CONSTRAINT "episodic_edges_entity_uuid_fkey";

-- DropForeignKey
ALTER TABLE "episodic_edges" DROP CONSTRAINT "episodic_edges_episodic_uuid_fkey";

-- DropForeignKey
ALTER TABLE "has_episode_edges" DROP CONSTRAINT "has_episode_edges_episodic_uuid_fkey";

-- DropForeignKey
ALTER TABLE "has_episode_edges" DROP CONSTRAINT "has_episode_edges_saga_uuid_fkey";

-- DropForeignKey
ALTER TABLE "llm_configs" DROP CONSTRAINT "llm_configs_userId_fkey";

-- DropIndex
DROP INDEX "entity_edges_source_uuid_idx";

-- DropIndex
DROP INDEX "entity_edges_target_uuid_idx";

-- DropIndex
DROP INDEX "episodic_edges_entity_uuid_idx";

-- DropIndex
DROP INDEX "episodic_edges_episodic_uuid_idx";

-- DropIndex
DROP INDEX "has_episode_edges_saga_uuid_idx";

-- DropIndex
DROP INDEX "llm_configs_userId_provider_key";

-- AlterTable
ALTER TABLE "entity_edges" DROP CONSTRAINT "entity_edges_pkey",
DROP COLUMN "source_uuid",
DROP COLUMN "target_uuid",
DROP COLUMN "uuid",
ADD COLUMN     "id" UUID NOT NULL,
ADD COLUMN     "source_id" UUID NOT NULL,
ADD COLUMN     "target_id" UUID NOT NULL,
ALTER COLUMN "valid_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "invalid_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "expired_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ADD CONSTRAINT "entity_edges_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "entity_nodes" DROP CONSTRAINT "entity_nodes_pkey",
DROP COLUMN "uuid",
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ADD CONSTRAINT "entity_nodes_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "episodic_edges" DROP CONSTRAINT "episodic_edges_pkey",
DROP COLUMN "entity_uuid",
DROP COLUMN "episodic_uuid",
DROP COLUMN "uuid",
ADD COLUMN     "entity_id" UUID NOT NULL,
ADD COLUMN     "episodic_id" UUID NOT NULL,
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ADD CONSTRAINT "episodic_edges_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "episodic_nodes" DROP CONSTRAINT "episodic_nodes_pkey",
DROP COLUMN "uuid",
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "valid_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ADD CONSTRAINT "episodic_nodes_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "graphs" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "has_episode_edges" DROP CONSTRAINT "has_episode_edges_pkey",
DROP COLUMN "episodic_uuid",
DROP COLUMN "saga_uuid",
DROP COLUMN "uuid",
ADD COLUMN     "episodic_id" UUID NOT NULL,
ADD COLUMN     "id" UUID NOT NULL,
ADD COLUMN     "saga_id" UUID NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ADD CONSTRAINT "has_episode_edges_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "llm_configs" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
ADD COLUMN     "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "user_id" UUID NOT NULL,
DROP COLUMN "provider",
ADD COLUMN     "provider" "llm_provider" NOT NULL;

-- AlterTable
ALTER TABLE "saga_nodes" DROP CONSTRAINT "saga_nodes_pkey",
DROP COLUMN "uuid",
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "last_summarized_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ADD CONSTRAINT "saga_nodes_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP COLUMN "activeLlmProvider",
DROP COLUMN "createdAt",
DROP COLUMN "passwordHash",
DROP COLUMN "updatedAt",
ADD COLUMN     "active_llm_provider" "llm_provider",
ADD COLUMN     "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "password_hash" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL,
DROP COLUMN "role",
ADD COLUMN     "role" "role" NOT NULL DEFAULT 'USER';

-- DropEnum
DROP TYPE "LlmProvider";

-- DropEnum
DROP TYPE "Role";

-- CreateIndex
CREATE INDEX "entity_edges_source_id_idx" ON "entity_edges"("source_id");

-- CreateIndex
CREATE INDEX "entity_edges_target_id_idx" ON "entity_edges"("target_id");

-- CreateIndex
CREATE INDEX "episodic_edges_episodic_id_idx" ON "episodic_edges"("episodic_id");

-- CreateIndex
CREATE INDEX "episodic_edges_entity_id_idx" ON "episodic_edges"("entity_id");

-- CreateIndex
CREATE INDEX "has_episode_edges_saga_id_idx" ON "has_episode_edges"("saga_id");

-- CreateIndex
CREATE UNIQUE INDEX "llm_configs_user_id_provider_key" ON "llm_configs"("user_id", "provider");

-- AddForeignKey
ALTER TABLE "llm_configs" ADD CONSTRAINT "llm_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_edges" ADD CONSTRAINT "entity_edges_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "entity_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_edges" ADD CONSTRAINT "entity_edges_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "entity_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodic_edges" ADD CONSTRAINT "episodic_edges_episodic_id_fkey" FOREIGN KEY ("episodic_id") REFERENCES "episodic_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodic_edges" ADD CONSTRAINT "episodic_edges_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entity_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "has_episode_edges" ADD CONSTRAINT "has_episode_edges_saga_id_fkey" FOREIGN KEY ("saga_id") REFERENCES "saga_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "has_episode_edges" ADD CONSTRAINT "has_episode_edges_episodic_id_fkey" FOREIGN KEY ("episodic_id") REFERENCES "episodic_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
