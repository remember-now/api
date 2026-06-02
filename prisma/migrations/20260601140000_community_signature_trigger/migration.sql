-- Compute community.member_set_signature: sha256 over sorted member_ids only.
-- Independent of entity_nodes.summary - changes only when membership changes.
-- Used to short-circuit "same set" detection in matchClusters.
--
-- IMMUTABLE because the result depends only on the input array contents.
CREATE OR REPLACE FUNCTION compute_community_set_signature(member_ids uuid[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    sha256(convert_to(
      coalesce(string_agg(id::text, E'\n' ORDER BY id), ''),
      'UTF8'
    )),
    'hex'
  )
  FROM unnest(member_ids) AS id;
$$;

-- Compute community.member_summary_hashes: jsonb map {entityId -> sha256(summary)}
-- snapshot of the inputs at the time member_ids was written. Drift detection
-- compares this snapshot against fresh entity_nodes.summary hashes at match
-- time, so we can identify exactly which members' summaries changed.
--
-- STABLE so the planner can cache within a statement; not IMMUTABLE because the
-- entity_nodes.summary it reads can change across statements.
CREATE OR REPLACE FUNCTION compute_community_member_summary_hashes(member_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    jsonb_object_agg(
      en.id::text,
      encode(sha256(convert_to(coalesce(en.summary, ''), 'UTF8')), 'hex')
    ),
    '{}'::jsonb
  )
  FROM entity_nodes en
  WHERE en.id = ANY(member_ids);
$$;

-- Trigger that fills both columns whenever member_ids is set (INSERT) or
-- changes (UPDATE OF member_ids). Application code never writes either column
-- directly; that contract lets us treat the stored values as "snapshot at last
-- touch of this row."
CREATE OR REPLACE FUNCTION set_community_member_signature()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.member_set_signature := compute_community_set_signature(NEW.member_ids);
  NEW.member_summary_hashes := compute_community_member_summary_hashes(NEW.member_ids);
  RETURN NEW;
END;
$$;

CREATE TRIGGER communities_set_member_signature
  BEFORE INSERT OR UPDATE OF member_ids ON communities
  FOR EACH ROW EXECUTE FUNCTION set_community_member_signature();
