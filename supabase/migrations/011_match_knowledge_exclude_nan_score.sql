-- Migration 11: excludes NaN scores from match_knowledge.
--
-- Real finding, caught by tests/integration/db/knowledge.test.ts's
-- min_score: 999 case, which started failing once the knowledge base was
-- ingested (Task 4): a zero query_embedding has no norm, so cosine
-- distance (`<=>`) is 0/0 = NaN. Confirmed live that Postgres's `numeric`
-- type gives NaN a total order where it compares greater than every other
-- value - `select 'NaN'::numeric >= 999` returns true - so a NaN score
-- passed `where s.score >= min_score` regardless of how high min_score
-- was, instead of being filtered out. `numeric NaN = numeric NaN` is also
-- true (same total-order rule), so `s.score != 'NaN'` correctly excludes
-- it without needing `is nan`-style syntax (float8 has that; numeric
-- doesn't).

create or replace function match_knowledge(
  query_embedding extensions.vector(384),
  query_text text,
  match_count int default 3,
  min_score numeric default 0.56
) returns table (
  chunk_id uuid,
  title text,
  section_path text,
  content text,
  summary text,
  score numeric
)
language plpgsql stable
set search_path = public, extensions
as $$
declare
  prefix_query tsquery;
begin
  select to_tsquery('english', string_agg(quote_literal(lexeme) || ':*', ' | '))
    into prefix_query
    from unnest(tsvector_to_array(to_tsvector('english', query_text))) as lexeme;

  return query
  select s.id, k.title, k.section_path, k.content, k.summary, s.score
  from (
    select
      kc.id,
      (
        (1 - (kc.embedding <=> query_embedding)) * 0.7
        + coalesce(ts_rank(kc.fts, prefix_query), 0) * 0.3
      )::numeric as score
    from knowledge_chunks kc
    where kc.embedding is not null
  ) s
  join knowledge_chunks k on k.id = s.id
  where s.score >= min_score and s.score != 'NaN'::numeric
  order by s.score desc
  limit match_count;
end;
$$;
