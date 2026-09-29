-- Migration 9: fixes migration 008's own bug, caught immediately by the
-- retrieval tests it was written for - "column reference \"id\" is
-- ambiguous" (both the subquery and the joined knowledge_chunks have an
-- `id` column; the final select's bare `id` needs to be `s.id`). 008 is
-- left as it was written rather than edited in place, matching this
-- project's own migration-history convention (see migration 007's
-- comment). No other behaviour changes here.

create or replace function match_knowledge(
  query_embedding extensions.vector(384),
  query_text text,
  match_count int default 3,
  min_score numeric default 0.3
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

revoke execute on function match_knowledge(extensions.vector, text, int, numeric) from public;
grant execute on function match_knowledge(extensions.vector, text, int, numeric) to service_role;
