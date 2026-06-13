-- CreateTable
CREATE TABLE "communities" (
    "id" UUID NOT NULL,
    "graph_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "name_embedding" vector(768),
    "member_ids" UUID[],
    "member_set_signature" TEXT NOT NULL,
    "member_summary_hashes" JSONB NOT NULL,
    "graph_diskann_bucket" SMALLINT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- ─── graph_diskann_bucket trigger (matches entity_nodes/entity_edges pattern) ──
-- Reuses set_graph_diskann_bucket() function defined in 20260517000000_knowledge_graph.
CREATE TRIGGER communities_set_graph_diskann_bucket
  BEFORE INSERT OR UPDATE OF graph_id ON communities
  FOR EACH ROW EXECUTE FUNCTION set_graph_diskann_bucket();

-- ─── fts_vector column + trigger ───────────────────────────────────────────────
-- Reuses set_name_summary_fts_vector() defined in 20260517000000_knowledge_graph
-- (communities share entity_nodes' name(A) + summary(B) shape).
ALTER TABLE "communities" ADD COLUMN "fts_vector" tsvector;

CREATE TRIGGER communities_set_fts_vector
  BEFORE INSERT OR UPDATE OF name, summary ON communities
  FOR EACH ROW EXECUTE FUNCTION set_name_summary_fts_vector();

-- CreateIndex
CREATE INDEX "communities_graph_id_idx" ON "communities"("graph_id");

-- CreateIndex
CREATE INDEX "communities_graph_id_member_set_signature_idx" ON "communities"("graph_id", "member_set_signature");

-- ─── Vector index (StreamingDiskANN, filtered by graph_diskann_bucket) ───────
CREATE INDEX "communities_embedding_idx"
  ON "communities" USING diskann ("name_embedding" vector_cosine_ops, "graph_diskann_bucket");

-- ─── Fulltext (GIN) index on stored fts_vector ───────────────────────────────
CREATE INDEX "communities_fts_idx" ON "communities" USING gin ("fts_vector");

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
