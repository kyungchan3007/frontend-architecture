CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

CREATE TABLE books (
  id text PRIMARY KEY,
  title text NOT NULL,
  subtitle text,
  publisher text,
  year int,
  kdc text,
  series text,
  volume text,
  description text,
  toc text,
  keywords text[],
  isbn text[],
  popularity int NOT NULL
);

CREATE TABLE authors (
  id bigserial PRIMARY KEY,
  name text UNIQUE NOT NULL
);

CREATE TABLE book_authors (
  book_id text REFERENCES books,
  author_id bigint REFERENCES authors,
  position int,
  PRIMARY KEY (book_id, author_id)
);

CREATE TABLE reviews (
  id bigserial PRIMARY KEY,
  book_id text REFERENCES books,
  rating int NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL
);
