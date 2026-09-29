-- Migration 5 of 6: knowledge_chunks and match_knowledge(), the hybrid
-- (vector + full-text) search behind search_knowledge (SYSTEM-DESIGN.md §6).
--
-- Confirmed against pgvector's own docs before writing this, not assumed:
-- `<=>` is cosine *distance* (0 = identical), so `1 - (a <=> b)` is cosine
-- similarity; `vector_cosine_ops` is the matching HNSW operator class.
--
-- The 0.7/0.3 blend weight and the 0.3 default relevance floor are
-- provisional - SYSTEM-DESIGN.md §6 calls for tuning both against a small
-- labelled question set (Task 4), which lives in the repo as a unit test.

create extension if not exists vector with schema extensions;

create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- e.g. "Policies And Compliance > Account Restrictions" (SYSTEM-DESIGN.md §6).
  section_path text not null,
  content text not null,
  summary text not null,
  -- Hash of section_path + content - re-ingest is idempotent on this: an
  -- unchanged chunk is skipped (keeps its embedding and its Haiku-written
  -- summary, so re-running costs nothing).
  content_hash text not null unique,
  embedding extensions.vector(384),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(section_path, '') || ' ' || coalesce(content, '') || ' ' || coalesce(summary, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_chunks_fts_idx on knowledge_chunks using gin (fts);
create index knowledge_chunks_embedding_idx on knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

create function match_knowledge(
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
language sql stable
set search_path = public, extensions
as $$
  select id, title, section_path, content, summary, score
  from (
    select
      id, title, section_path, content, summary,
      (
        (1 - (embedding <=> query_embedding)) * 0.7
        + coalesce(ts_rank(fts, websearch_to_tsquery('english', query_text)), 0) * 0.3
      )::numeric as score
    from knowledge_chunks
    where embedding is not null
  ) scored
  where score >= min_score
  order by score desc
  limit match_count;
$$;

revoke execute on function match_knowledge(extensions.vector, text, int, numeric) from public;
grant execute on function match_knowledge(extensions.vector, text, int, numeric) to service_role;

comment on table knowledge_chunks is 'The approved RelayPay knowledge base, chunked by heading (assets/relaypay-knowledge-base.md), with embeddings for search_knowledge.';
comment on function match_knowledge is 'Hybrid vector + full-text search behind search_knowledge - SYSTEM-DESIGN.md §6.';
