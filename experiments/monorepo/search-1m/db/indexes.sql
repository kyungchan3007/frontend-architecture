-- 기준선 인덱스. 대량 입력 뒤에 만든다.
CREATE INDEX book_authors_author_id_idx ON book_authors (author_id);
CREATE INDEX reviews_book_id_idx ON reviews (book_id);
