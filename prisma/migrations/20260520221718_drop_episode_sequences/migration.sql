/*
  Warnings:

  - You are about to drop the `episode_sequences` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "episode_sequences" DROP CONSTRAINT "episode_sequences_episode_uuid_fkey";

-- DropForeignKey
ALTER TABLE "episode_sequences" DROP CONSTRAINT "episode_sequences_graph_id_fkey";

-- DropForeignKey
ALTER TABLE "episode_sequences" DROP CONSTRAINT "episode_sequences_next_uuid_fkey";

-- DropTable
DROP TABLE "episode_sequences";
