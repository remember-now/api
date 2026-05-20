/*
  Warnings:

  - The primary key for the `llm_configs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `llm_configs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `userId` on the `llm_configs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `users` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "llm_configs" DROP CONSTRAINT "llm_configs_userId_fkey";

-- AlterTable
ALTER TABLE "llm_configs" DROP CONSTRAINT "llm_configs_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "llm_configs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "graphs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graphs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "graphs_user_id_idx" ON "graphs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "graphs_user_id_name_key" ON "graphs"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "llm_configs_userId_provider_key" ON "llm_configs"("userId", "provider");

-- AddForeignKey
ALTER TABLE "graphs" ADD CONSTRAINT "graphs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_configs" ADD CONSTRAINT "llm_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_nodes" ADD CONSTRAINT "entity_nodes_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_edges" ADD CONSTRAINT "entity_edges_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodic_nodes" ADD CONSTRAINT "episodic_nodes_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodic_edges" ADD CONSTRAINT "episodic_edges_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saga_nodes" ADD CONSTRAINT "saga_nodes_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "has_episode_edges" ADD CONSTRAINT "has_episode_edges_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_sequences" ADD CONSTRAINT "episode_sequences_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
