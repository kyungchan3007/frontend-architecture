\set ON_ERROR_STOP on
\timing on

\copy books FROM '/generated/books.csv' WITH (FORMAT csv, NULL '\N')
\copy authors (id, name) FROM '/generated/authors.csv' WITH (FORMAT csv)
SELECT setval('authors_id_seq', (SELECT max(id) FROM authors));
\copy book_authors FROM '/generated/book_authors.csv' WITH (FORMAT csv)
\copy reviews (book_id, rating, body, created_at) FROM '/generated/reviews.csv' WITH (FORMAT csv)

\i /db/indexes.sql
VACUUM ANALYZE;
