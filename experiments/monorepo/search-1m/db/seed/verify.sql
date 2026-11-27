\pset pager off

\echo == 건수
SELECT (SELECT count(*) FROM books) AS books,
       (SELECT count(*) FROM authors) AS authors,
       (SELECT count(*) FROM book_authors) AS book_authors,
       (SELECT count(*) FROM reviews) AS reviews;

\echo == 필드 채움 비율(%)
SELECT round(100.0 * count(subtitle) / count(*), 1) AS subtitle,
       round(100.0 * count(publisher) / count(*), 1) AS publisher,
       round(100.0 * count(year) / count(*), 1) AS year,
       round(100.0 * count(kdc) / count(*), 1) AS kdc,
       round(100.0 * count(*) FILTER (WHERE cardinality(isbn) > 0) / count(*), 1) AS isbn,
       round(100.0 * count(*) FILTER (WHERE cardinality(keywords) > 0) / count(*), 1) AS keywords,
       round(100.0 * count(toc) / count(*), 1) AS toc
FROM books;

\echo == 저자 이름이 있는 도서(%)
SELECT round(100.0 * count(DISTINCT book_id) / 1000000, 1) AS with_author FROM book_authors;

\echo == 깨진 값 확인: 전부 0이어야 함
SELECT (SELECT count(*) FROM books WHERE title = '') AS empty_title,
       (SELECT count(*) FROM books WHERE publisher = '\N' OR subtitle = '\N' OR kdc = '\N') AS literal_null,
       (SELECT count(*) FROM books WHERE year < 1000 OR year > 2026) AS bad_year,
       (SELECT count(*) FROM reviews WHERE rating NOT BETWEEN 1 AND 5) AS bad_rating,
       (SELECT count(*) FROM reviews r LEFT JOIN books b ON b.id = r.book_id WHERE b.id IS NULL) AS orphan_reviews;

\echo == 인기도: 지프 분포 확인
SELECT r AS rank, popularity
FROM (SELECT popularity, row_number() OVER (ORDER BY popularity DESC, id) AS r FROM books) t
WHERE r IN (1, 2, 10, 100, 1000, 100000, 1000000)
ORDER BY r;

\echo == 인기도와 리뷰 수: 상위 5권
SELECT b.popularity, count(r.id) AS reviews, b.title
FROM books b JOIN reviews r ON r.book_id = b.id
GROUP BY b.id, b.popularity, b.title
ORDER BY b.popularity DESC LIMIT 5;

\echo == 리뷰 분포
WITH c AS (SELECT book_id, count(*) AS n FROM reviews GROUP BY book_id)
SELECT 1000000 - count(*) AS books_without_reviews, max(n) AS max_reviews,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY n) AS median_when_reviewed FROM c;

\echo == 평점 비율(%)
SELECT rating, round(100.0 * count(*) / 3000000, 1) AS pct FROM reviews GROUP BY rating ORDER BY rating;

\echo == 제목 검색어 건수
SELECT q, (SELECT count(*) FROM books WHERE title LIKE '%' || q || '%') AS n
FROM unnest(ARRAY['연구', '한국', '사랑', '파이썬', '해리', '꽃']) AS q;

\echo == 테이블과 인덱스 크기
SELECT relname, pg_size_pretty(pg_table_size(oid)) AS table_size, pg_size_pretty(pg_indexes_size(oid)) AS index_size
FROM pg_class WHERE relname IN ('books', 'authors', 'book_authors', 'reviews') ORDER BY relname;

\echo == 인덱스 목록
SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1, 2;

\echo == 표본 도서 1권
SELECT b.title, b.publisher, b.year, b.kdc, b.isbn, array_agg(a.name ORDER BY ba.position) AS authors
FROM books b JOIN book_authors ba ON ba.book_id = b.id JOIN authors a ON a.id = ba.author_id
WHERE b.title LIKE '%파이썬%' AND cardinality(b.isbn) > 0
GROUP BY b.id LIMIT 1;

\echo == pg_stat_statements 동작 확인
SELECT count(*) > 0 AS enabled FROM pg_stat_statements;
