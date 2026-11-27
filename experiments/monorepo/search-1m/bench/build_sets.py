"""측정에 쓰는 검색어, 트래픽 순서, 품질 평가 세트를 시드 고정으로 만든다.

사용법: python3 -I bench/build_sets.py data/books_1m.jsonl data/generated/books.csv bench
"""
import collections as C
import csv
import json
import random
import re
import sys

SEED = 20261105
csv.field_size_limit(10_000_000)
TOKEN = re.compile(r"[가-힣]+")
GROUP_WEIGHTS = {"many": 50, "few": 30, "author": 10, "single": 5, "none": 5}
NONE_TERMS = ["뷁쀍꿿", "퉯뜗쀓", "쀍뷁퉯", "꿿뜗뷁", "뜗쀓꿿"]
MEDIA_PUBLISHERS = re.compile(r"레코드|Media|미디어|음반|방송|비디오")
CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"


def chosung(text):
    out = []
    for ch in text:
        code = ord(ch) - 0xAC00
        out.append(CHO[code // 588] if 0 <= code <= 11171 else ch)
    return "".join(out)


def zipf_choices(rng, items, k):
    weights = [1 / (i + 1) for i in range(len(items))]
    return rng.choices(items, weights, k=k)


def main():
    jsonl, books_csv, out = sys.argv[1:4]
    rng = random.Random(SEED)
    books = [json.loads(line) for line in open(jsonl, encoding="utf-8")]
    books.sort(key=lambda b: b["id"])

    words, syllables, authors = C.Counter(), C.Counter(), C.Counter()
    for b in books:
        for t in set(TOKEN.findall(b["title"])):
            (syllables if len(t) == 1 else words)[t] += 1
        authors.update(set(b["authors"]))

    many = [w for w, _ in words.most_common(40)]
    for must in ("연구", "한국", "사랑"):
        if must not in many:
            many.insert(0, must)
    few_pool = sorted(w for w, c in words.items() if 50 <= c <= 500)
    few = rng.sample(few_pool, 200)
    for must in ("해리", "파이썬"):
        if must not in few:
            few.insert(0, must)
    author_pool = [a for a, c in authors.most_common(5000) if re.fullmatch(r"[가-힣]{2,4}", a)]
    author = author_pool[:50] + rng.sample(author_pool[50:], 150)
    if "김지영" not in author:
        author.insert(0, "김지영")
    single = [w for w, _ in syllables.most_common(30)]
    if "꽃" not in single:
        single.insert(0, "꽃")
    groups = {"many": many, "few": few, "author": author, "single": single, "none": NONE_TERMS}

    def draw(k):
        names = rng.choices(list(GROUP_WEIGHTS), list(GROUP_WEIGHTS.values()), k=k)
        return [(g, zipf_choices(rng, groups[g], 1)[0]) for g in names]

    search = []
    for g, q in draw(30000):
        cond = rng.choices(["basic", "filter", "sort", "deep"], [55, 20, 20, 5])[0]
        row = {"g": g, "q": q, "c": cond}
        if cond == "filter":
            row["kdc"] = rng.choice("0123456789")
        if cond == "sort":
            row["sort"] = rng.choice(["popular", "latest"])
        if cond == "deep":
            row["page"] = 5000
        search.append(row)
    autocomplete = [{"g": g, "q": q} for g, q in draw(15000)]

    ids, pops = [], []
    with open(books_csv, encoding="utf-8", newline="") as f:
        for row in csv.reader(f):
            ids.append(row[0])
            pops.append(int(row[12]))
    endpoints = ["html", "book", "reviews", "recommendations", "holding"]
    detail = [{"id": i, "ep": rng.choice(endpoints)} for i in rng.choices(ids, pops, k=30000)]

    json.dump({"seed": SEED, "group_weights": GROUP_WEIGHTS, "groups": groups, "search": search,
               "autocomplete": autocomplete, "detail": detail},
              open(f"{out}/queries.json", "w", encoding="utf-8"), ensure_ascii=False)

    # 품질 세트: 정답 도서를 자동 선정한다. 비도서를 피하려고 ISBN이 있고 매체 출판사가 아닌 책만 쓴다.
    title_count = C.Counter(re.sub(r"\s+", "", b["title"]) for b in books)
    pool = [b for b in books if b["isbn"] and b["kdc"] and b["publisher"]
            and not MEDIA_PUBLISHERS.search(b["publisher"]) and title_count[re.sub(r"\s+", "", b["title"])] == 1
            and re.fullmatch(r"[가-힣 ]{5,16}", b["title"])]
    spaced = [b for b in pool if " " in b["title"]]
    rare_author = [b for b in pool if len(b["authors"]) == 1 and re.fullmatch(r"[가-힣]{2,4}", b["authors"][0])
                   and authors[b["authors"][0]] <= 5]
    quality = []

    def add(kind, b, q):
        quality.append({"kind": kind, "query": q, "expected_id": b["id"], "title": b["title"]})

    used = set()

    def take(items, k):
        got = []
        for b in rng.sample(items, min(len(items), k * 20)):
            if b["id"] not in used:
                used.add(b["id"])
                got.append(b)
            if len(got) == k:
                return got
        raise SystemExit("품질 세트 후보가 부족합니다")

    for b in take(pool, 10):
        add("exact", b, b["title"])
    for b in take(spaced, 6):
        add("no_space", b, b["title"].replace(" ", ""))
    for b in take(spaced, 6):
        add("partial", b, max(b["title"].split(), key=len))
    for b in take(rare_author, 4):
        add("author", b, b["authors"][0])
    for b in take(pool, 4):
        add("chosung", b, chosung(b["title"].replace(" ", "")))
    json.dump(quality, open(f"{out}/quality.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print({k: len(v) for k, v in groups.items()}, "many", many[:8], "single", single[:6], "quality", len(quality))
    print("many counts", [(w, words[w]) for w in many[:5]], "few", [(w, words[w]) for w in few[:3]])


if __name__ == "__main__":
    main()
