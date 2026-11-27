-- B1: 전체 스캔 대처. 3글자 이상은 pg_trgm, 1~2글자는 글자 조각 인덱스를 쓴다.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION text_grams(t text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT array_agg(DISTINCT g)
  FROM (
    SELECT substr(lower(t), i, n) AS g
    FROM generate_series(1, length(t)) AS i, unnest(ARRAY[1, 2]) AS n
    WHERE i + n - 1 <= length(t)
  ) s
$$;

CREATE INDEX IF NOT EXISTS books_title_trgm ON books USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS authors_name_trgm ON authors USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS books_title_grams ON books USING gin (text_grams(title));
CREATE INDEX IF NOT EXISTS authors_name_grams ON authors USING gin (text_grams(name));
ANALYZE books;
ANALYZE authors;
