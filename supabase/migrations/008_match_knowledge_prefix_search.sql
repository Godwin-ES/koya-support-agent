-- Migration 8: match_knowledge, revised after Task 4's labelled-set tuning.
--
-- Real finding: `websearch_to_tsquery('english', 'Does RelayPay let me pay
-- with crypto?')` scored 0.0 full-text relevance against the chunk that
-- literally lists "Cryptocurrency payments" as unsupported - confirmed with
-- a raw query. Postgres's English stemmer reduces "cryptocurrency" to
-- "cryptocurr", and "crypto" alone doesn't stem down to match it; ordinary
-- `websearch_to_tsquery` requires an exact lexeme match, not a prefix.
-- Fixed by turning the query into an OR of *prefix* matches instead
-- (confirmed live: `to_tsquery('english', 'crypto:*')` does match
-- "cryptocurr"). `tsvector_to_array(to_tsvector('english', query_text))`
-- gives the same stemmed, stopword-filtered lexemes `websearch_to_tsquery`
-- would use, just as an array to rebuild as prefixes.

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
