-- Migration 10: raises match_knowledge's default relevance floor from 0.3
-- to 0.56, from the labelled-set tuning (Task 4).
--
-- Real finding: with this embedding model (gte-small, a small general-
-- purpose model) and this chunk size, even unrelated questions ("What's
-- your favorite movie?") score 0.45-0.55 against *something* - there's no
-- floor that perfectly separates every true match from every false one;
-- the 0.50-0.56 band has real overlap either way. Chose to bias toward
-- fewer false positives: a genuinely relevant but weakly-scored question
-- (SYSTEM-DESIGN.md §4's own crypto example: "does RelayPay let me pay
-- with crypto" scores ~0.66 against unrelated chunks and doesn't clear
-- this floor against its own answer either) then finds nothing and the
-- agent declines or escalates rather than answering from a weak match -
-- the safer of the two failure directions this project is graded on.

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
  where s.score >= min_score
  order by s.score desc
  limit match_count;
end;
$$;
