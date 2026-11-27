-- B1 되돌리기: 다음 시나리오가 기준선 DB에서 시작하도록 지운다.
DROP INDEX IF EXISTS books_title_trgm;
DROP INDEX IF EXISTS authors_name_trgm;
DROP INDEX IF EXISTS books_title_grams;
DROP INDEX IF EXISTS authors_name_grams;
DROP FUNCTION IF EXISTS text_grams(text);
DROP EXTENSION IF EXISTS pg_trgm;
ANALYZE books;
ANALYZE authors;
