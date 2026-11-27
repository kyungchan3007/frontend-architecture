"""books_1m.jsonl에서 DB 입력용 CSV와 합성 인기도 · 리뷰를 만든다.

사용법: python3 -I generate.py <books_1m.jsonl> <출력 폴더>
합성 규칙: 인기도는 지프 분포(α=1.0), 리뷰 300만 건은 인기도에 비례, 시드 고정.
"""
import csv
import datetime as dt
import json
import os
import random
import sys

SEED = 20261104
ALPHA = 1.0
MAX_POPULARITY = 1_000_000
TOTAL_REVIEWS = 3_000_000
OPENINGS = ["처음에는 큰 기대 없이 읽었는데", "추천을 받아 읽게 되었는데", "오래 고민하다 골랐는데",
            "제목에 끌려 집어 들었는데", "다시 읽어 보니", "도서관에서 빌려 읽었는데"]
MIDDLES = ["내용이 알차고 설명이 친절합니다", "생각보다 깊이가 있어 천천히 읽었습니다",
           "구성이 깔끔해서 금방 읽혔습니다", "기대한 내용과 조금 달랐습니다",
           "중간부터 흐름이 늘어지는 느낌입니다", "곁에 두고 다시 찾아볼 만합니다"]
ENDINGS = ["주변에도 권하고 싶어요.", "다음 책도 찾아보려고 합니다.", "입문자에게 괜찮을 것 같아요.",
           "아쉬운 점도 있지만 만족합니다.", "시간이 아깝지는 않았습니다.", "한 번쯤 읽어 볼 만합니다."]
RATINGS = [1, 2, 3, 4, 5]
RATING_WEIGHTS = [4, 7, 19, 35, 35]
START = dt.datetime(2020, 1, 1, tzinfo=dt.timezone.utc)
SPAN_SECONDS = int((dt.datetime(2026, 10, 31, tzinfo=dt.timezone.utc) - START).total_seconds())


def clean(v):
    return None if v is None else str(v).replace("\x00", "")


def pg_array(values):
    if not values:
        return "{}"
    items = []
    for v in values:
        s = clean(v).replace("\\", "\\\\").replace('"', '\\"')
        items.append(f'"{s}"')
    return "{" + ",".join(items) + "}"


def null(v):
    return r"\N" if v is None else clean(v)


def review_counts(pop_by_rank):
    total_pop = sum(pop_by_rank)
    exact = [p * TOTAL_REVIEWS / total_pop for p in pop_by_rank]
    counts = [int(x) for x in exact]
    left = TOTAL_REVIEWS - sum(counts)
    order = sorted(range(len(exact)), key=lambda i: (exact[i] - counts[i], -i), reverse=True)
    for i in order[:left]:
        counts[i] += 1
    return counts


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    rng = random.Random(SEED)
    books = [json.loads(line) for line in open(src, encoding="utf-8")]
    books.sort(key=lambda b: b["id"])

    ranks = list(range(len(books)))
    rng.shuffle(ranks)  # ranks[i] = i번째 도서의 인기 순위(0부터)
    pop_by_rank = [max(1, round(MAX_POPULARITY / (r + 1) ** ALPHA)) for r in range(len(books))]
    counts = review_counts(pop_by_rank)

    author_ids = {}
    opts = dict(lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    with open(f"{out}/books.csv", "w", newline="", encoding="utf-8") as fb, \
         open(f"{out}/book_authors.csv", "w", newline="", encoding="utf-8") as fa, \
         open(f"{out}/reviews.csv", "w", newline="", encoding="utf-8") as fr:
        wb, wa, wr = csv.writer(fb, **opts), csv.writer(fa, **opts), csv.writer(fr, **opts)
        for i, b in enumerate(books):
            rank = ranks[i]
            wb.writerow([clean(b["id"]), clean(b["title"]), null(b["subtitle"]), null(b["publisher"]),
                         null(b["year"]), null(b["kdc"]), null(b["series"]), null(b["volume"]),
                         null(b["description"]), null(b["toc"]), pg_array(b["keywords"]), pg_array(b["isbn"]),
                         pop_by_rank[rank]])
            for pos, name in enumerate(b["authors"]):
                name = clean(name).strip()
                if not name:
                    continue
                aid = author_ids.setdefault(name, len(author_ids) + 1)
                wa.writerow([clean(b["id"]), aid, pos])
            for _ in range(counts[rank]):
                body = f"{rng.choice(OPENINGS)} {rng.choice(MIDDLES)}. {rng.choice(ENDINGS)}"
                at = START + dt.timedelta(seconds=rng.randrange(SPAN_SECONDS))
                wr.writerow([clean(b["id"]), rng.choices(RATINGS, RATING_WEIGHTS)[0], body, at.isoformat()])
    with open(f"{out}/authors.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, **opts)
        for name, aid in author_ids.items():
            w.writerow([aid, name])
    meta = {"seed": SEED, "alpha": ALPHA, "books": len(books), "authors": len(author_ids),
            "reviews": sum(counts), "books_without_reviews": sum(c == 0 for c in counts),
            "max_reviews_per_book": max(counts), "total_popularity": sum(pop_by_rank)}
    json.dump(meta, open(f"{out}/meta.json", "w", encoding="utf-8"), indent=1)
    print(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
