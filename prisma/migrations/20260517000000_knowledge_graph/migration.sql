-- Knowledge graph migration: pgvectorscale + 7 tables replacing Neo4j.

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;

-- ─── graph_diskann_bucket helper ───────────────────────────────────────────────────────
-- Generated columns reject STABLE functions like hashtext(). uuid_send and
-- get_byte are both IMMUTABLE. UUID v4's first 2 bytes are uniformly random,
-- giving even SMALLINT distribution across -32768..32767 - perfect for
-- pgvectorscale's filtered-DiskANN label bucketing.
CREATE OR REPLACE FUNCTION graph_diskann_bucket_for(g uuid)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT (((get_byte(uuid_send(g), 0)::int << 8) | get_byte(uuid_send(g), 1)::int) - 32768)::smallint
$$;

-- ─── Tables ───────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "entity_nodes" (
    "uuid" UUID NOT NULL,
    "graph_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "labels" TEXT[],
    "name_embedding" vector(768),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_nodes_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "entity_edges" (
    "uuid" UUID NOT NULL,
    "graph_id" UUID NOT NULL,
    "source_uuid" UUID NOT NULL,
    "target_uuid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "fact_embedding" vector(768),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "episodes" UUID[],
    "valid_at" TIMESTAMP(3),
    "invalid_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_edges_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "episodic_nodes" (
    "uuid" UUID NOT NULL,
    "graph_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "labels" TEXT[],
    "source" TEXT NOT NULL,
    "source_description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "valid_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episodic_nodes_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "episodic_edges" (
    "uuid" UUID NOT NULL,
    "graph_id" UUID NOT NULL,
    "episodic_uuid" UUID NOT NULL,
    "entity_uuid" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episodic_edges_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "saga_nodes" (
    "uuid" UUID NOT NULL,
    "graph_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "labels" TEXT[],
    "summary" TEXT NOT NULL DEFAULT '',
    "last_summarized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saga_nodes_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "has_episode_edges" (
    "uuid" UUID NOT NULL,
    "graph_id" UUID NOT NULL,
    "saga_uuid" UUID NOT NULL,
    "episodic_uuid" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "has_episode_edges_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "episode_sequences" (
    "uuid" UUID NOT NULL,
    "graph_id" UUID NOT NULL,
    "episode_uuid" UUID NOT NULL,
    "next_uuid" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episode_sequences_pkey" PRIMARY KEY ("uuid")
);

-- ─── graph_diskann_bucket columns + trigger (pgvectorscale filtered DiskANN bucket) ───
-- Prisma's diff engine doesn't understand `GENERATED ALWAYS AS … STORED`
-- columns: it reads the generation clause as a "default" and proposes
-- `ALTER COLUMN … DROP DEFAULT` on every subsequent `migrate dev`. We use a
-- BEFORE INSERT/UPDATE trigger instead - same effect, invisible to Prisma.
ALTER TABLE "entity_nodes" ADD COLUMN "graph_diskann_bucket" SMALLINT[];
ALTER TABLE "entity_edges" ADD COLUMN "graph_diskann_bucket" SMALLINT[];

CREATE OR REPLACE FUNCTION set_graph_diskann_bucket()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.graph_diskann_bucket := ARRAY[graph_diskann_bucket_for(NEW.graph_id)];
  RETURN NEW;
END;
$$;

CREATE TRIGGER entity_nodes_set_graph_diskann_bucket
  BEFORE INSERT OR UPDATE OF graph_id ON entity_nodes
  FOR EACH ROW EXECUTE FUNCTION set_graph_diskann_bucket();

CREATE TRIGGER entity_edges_set_graph_diskann_bucket
  BEFORE INSERT OR UPDATE OF graph_id ON entity_edges
  FOR EACH ROW EXECUTE FUNCTION set_graph_diskann_bucket();

-- ─── fts_vector columns + triggers (full-text search) ──────────────────────────
-- Trigger-populated (not GENERATED ALWAYS AS … STORED) for the same reason as
-- graph_diskann_bucket: Prisma's diff engine misreads a generation clause as a
-- column default and proposes DROP DEFAULT on every migrate dev. setweight ranks
-- name (A) above the body field (B) for ts_rank_cd.
ALTER TABLE "entity_nodes" ADD COLUMN "fts_vector" tsvector;
ALTER TABLE "entity_edges" ADD COLUMN "fts_vector" tsvector;
ALTER TABLE "episodic_nodes" ADD COLUMN "fts_vector" tsvector;

CREATE OR REPLACE FUNCTION set_name_summary_fts_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_entity_edge_fts_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.fact, '')), 'B');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_episodic_node_fts_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts_vector := setweight(to_tsvector('english', coalesce(NEW.content, '')), 'A');
  RETURN NEW;
END;
$$;

CREATE TRIGGER entity_nodes_set_fts_vector
  BEFORE INSERT OR UPDATE OF name, summary ON entity_nodes
  FOR EACH ROW EXECUTE FUNCTION set_name_summary_fts_vector();

CREATE TRIGGER entity_edges_set_fts_vector
  BEFORE INSERT OR UPDATE OF name, fact ON entity_edges
  FOR EACH ROW EXECUTE FUNCTION set_entity_edge_fts_vector();

CREATE TRIGGER episodic_nodes_set_fts_vector
  BEFORE INSERT OR UPDATE OF content ON episodic_nodes
  FOR EACH ROW EXECUTE FUNCTION set_episodic_node_fts_vector();

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- CreateIndex
CREATE INDEX "entity_nodes_graph_id_idx" ON "entity_nodes"("graph_id");

-- CreateIndex
CREATE INDEX "entity_edges_graph_id_idx" ON "entity_edges"("graph_id");

-- CreateIndex
CREATE INDEX "entity_edges_source_uuid_idx" ON "entity_edges"("source_uuid");

-- CreateIndex
CREATE INDEX "entity_edges_target_uuid_idx" ON "entity_edges"("target_uuid");

-- CreateIndex
CREATE INDEX "episodic_nodes_graph_id_idx" ON "episodic_nodes"("graph_id");

-- CreateIndex
CREATE INDEX "episodic_nodes_valid_at_idx" ON "episodic_nodes"("valid_at");

-- CreateIndex
CREATE INDEX "episodic_edges_graph_id_idx" ON "episodic_edges"("graph_id");

-- CreateIndex
CREATE INDEX "episodic_edges_episodic_uuid_idx" ON "episodic_edges"("episodic_uuid");

-- CreateIndex
CREATE INDEX "episodic_edges_entity_uuid_idx" ON "episodic_edges"("entity_uuid");

-- CreateIndex
CREATE INDEX "saga_nodes_graph_id_idx" ON "saga_nodes"("graph_id");

-- CreateIndex
CREATE INDEX "saga_nodes_name_idx" ON "saga_nodes"("name");

-- CreateIndex
CREATE INDEX "has_episode_edges_graph_id_idx" ON "has_episode_edges"("graph_id");

-- CreateIndex
CREATE INDEX "has_episode_edges_saga_uuid_idx" ON "has_episode_edges"("saga_uuid");

-- CreateIndex
CREATE INDEX "episode_sequences_graph_id_idx" ON "episode_sequences"("graph_id");

-- CreateIndex
CREATE INDEX "episode_sequences_episode_uuid_idx" ON "episode_sequences"("episode_uuid");

-- ─── Vector indexes (StreamingDiskANN, filtered by graph_diskann_bucket) ──────────────
CREATE INDEX "entity_nodes_embedding_idx"
  ON "entity_nodes" USING diskann ("name_embedding" vector_cosine_ops, "graph_diskann_bucket");

CREATE INDEX "entity_edges_embedding_idx"
  ON "entity_edges" USING diskann ("fact_embedding" vector_cosine_ops, "graph_diskann_bucket");

-- ─── Fulltext (GIN) indexes on stored fts_vector ─────────────────────────────
CREATE INDEX "entity_nodes_fts_idx" ON "entity_nodes" USING gin ("fts_vector");

CREATE INDEX "entity_edges_fts_idx" ON "entity_edges" USING gin ("fts_vector");

CREATE INDEX "episodic_nodes_fts_idx" ON "episodic_nodes" USING gin ("fts_vector");

-- ─── Foreign keys ────────────────────────────────────────────────────────────

-- AddForeignKey
ALTER TABLE "entity_edges" ADD CONSTRAINT "entity_edges_source_uuid_fkey"
  FOREIGN KEY ("source_uuid") REFERENCES "entity_nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_edges" ADD CONSTRAINT "entity_edges_target_uuid_fkey"
  FOREIGN KEY ("target_uuid") REFERENCES "entity_nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodic_edges" ADD CONSTRAINT "episodic_edges_episodic_uuid_fkey"
  FOREIGN KEY ("episodic_uuid") REFERENCES "episodic_nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodic_edges" ADD CONSTRAINT "episodic_edges_entity_uuid_fkey"
  FOREIGN KEY ("entity_uuid") REFERENCES "entity_nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "has_episode_edges" ADD CONSTRAINT "has_episode_edges_saga_uuid_fkey"
  FOREIGN KEY ("saga_uuid") REFERENCES "saga_nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "has_episode_edges" ADD CONSTRAINT "has_episode_edges_episodic_uuid_fkey"
  FOREIGN KEY ("episodic_uuid") REFERENCES "episodic_nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_sequences" ADD CONSTRAINT "episode_sequences_episode_uuid_fkey"
  FOREIGN KEY ("episode_uuid") REFERENCES "episodic_nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_sequences" ADD CONSTRAINT "episode_sequences_next_uuid_fkey"
  FOREIGN KEY ("next_uuid") REFERENCES "episodic_nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
