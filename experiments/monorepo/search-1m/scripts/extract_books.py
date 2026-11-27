"""국립중앙도서관 LOD 오프라인 셋에서 한국어 일반도서를 고정 시드로 추출한다.

사용법: python3 -I extract_books.py <원본 폴더> <출력 폴더> [건수]
출처: 국립중앙도서관 LOD (공공누리 제1유형, CC0 1.0), 데이터 갱신일 2026-10-08
"""
import collections as C
import glob
import hashlib
import json
import multiprocessing as mp
import os
import re
import sys
import tempfile

SEED = "book-search-bench-v1"
HANGUL = re.compile(r"[가-힣]")
SEP_LINES = ("  }, {", "  },{")
NAME_KEYS = ("creator", "dc:creator", "http://purl.org/dc/elements/1.1/creator")
URI_KEYS = ("dcterms:creator", "http://purl.org/dc/terms/creator")


def records(path):
    buf = None
    with open(path, encoding="utf-8") as f:
        for line in f:
            s = line.rstrip("\n")
            if s == '  "@graph" : [{':
                buf = ["{"]
            elif s in SEP_LINES:
                buf.append("}")
                yield "".join(buf)
                buf = ["{"]
            elif s == "  },":  # 구분자가 "  }," 와 "{" 두 줄로 나뉜 경우
                buf.append("}")
                yield "".join(buf)
                buf = []
            elif re.fullmatch(r"  \}\],?", s):
                buf.append("}")
                yield "".join(buf)
                return
            elif buf is not None:
                buf.append(s)


def vals(v):
    if v is None:
        return []
    if isinstance(v, list):
        return [x for i in v for x in vals(i)]
    if isinstance(v, dict):
        return [v.get("@id") or v.get("@value")]
    return [v]


def texts(v):
    out = []
    for x in vals(v):
        if x and str(x) not in out:
            out.append(str(x))
    return out


def short(k):
    return re.split(r"[/#:]", k)[-1]


def clean_isbn(values):
    out = []
    for v in values:
        m = re.match(r"\s*([0-9][0-9Xx-]{8,16})", v)
        if m:
            d = m.group(1).replace("-", "").upper()
            if len(d) in (10, 13) and d not in out:
                out.append(d)
    return out


def clean_year(values):
    for v in values:
        if re.fullmatch(r"\d{4}", v) and 1000 <= int(v) <= 2026:
            return int(v)
    return None


def convert(r):
    n = {short(k): v for k, v in r.items() if k not in NAME_KEYS + URI_KEYS}
    if texts(n.get("typeOfData"))[:1] and texts(n.get("typeOfData"))[0].rsplit("/", 1)[-1] != "dt_gm":
        return None
    if not texts(n.get("typeOfData")):
        return None
    lang = (texts(n.get("language")) or [""])[0].rsplit("/", 1)[-1].lower()
    titles = texts(n.get("title"))
    if lang != "kor" or not titles or not HANGUL.search(titles[0]):
        return None
    raw = [x for k in NAME_KEYS for x in texts(r.get(k))]
    uris = [x for k in URI_KEYS for x in texts(r.get(k))]
    names = list(dict.fromkeys(x for x in raw if not x.startswith("http")))
    uris = list(dict.fromkeys(uris + [x for x in raw if x.startswith("http")]))
    return {
        "id": str(r["@id"]).rsplit("/", 1)[-1],
        "title": titles[0],
        "subtitle": (texts(n.get("remainderOfTitle")) or [None])[0],
        "authors": names,
        "author_ids": [u.rsplit("/", 1)[-1] for u in uris],
        "publisher": (texts(n.get("publisher")) or [None])[0],
        "year": clean_year(texts(n.get("issuedYear"))),
        "kdc": (texts(n.get("kdc")) or [None])[0],
        "keywords": texts(n.get("keyword")),
        "isbn": clean_isbn(texts(n.get("isbn"))),
        "series": (texts(n.get("titleOfSeries")) or [None])[0],
        "volume": (texts(n.get("volume")) or [None])[0],
        "description": (texts(n.get("description")) or [None])[0],
        "toc": (texts(n.get("tableOfContents")) or [None])[0],
    }


def sort_key(book_id):
    return hashlib.sha256(f"{SEED}:{book_id}".encode()).hexdigest()


def work(args):
    path, tmp = args
    out = os.path.join(tmp, os.path.basename(path) + ".jsonl")
    total, bad, keys, samples = 0, 0, [], []
    with open(out, "w", encoding="utf-8") as w:
        for raw in records(path):
            try:
                r = json.loads(raw)
            except Exception as e:
                bad += 1
                if len(samples) < 2:
                    samples.append(str(e)[:80] + " :: " + raw[:120])
                continue
            total += 1
            b = convert(r)
            if b:
                keys.append(sort_key(b["id"]))
                w.write(json.dumps(b, ensure_ascii=False) + "\n")
    return out, total, bad, keys, samples


def main():
    src, dst = sys.argv[1], sys.argv[2]
    want = int(sys.argv[3]) if len(sys.argv) > 3 else 1_000_000
    os.makedirs(dst, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src, "Offline_*.json")), key=lambda p: int(re.findall(r"(\d+)\.json", p)[0]))
    with tempfile.TemporaryDirectory(dir=dst) as tmp, mp.Pool(max(2, (os.cpu_count() or 4) - 2)) as pool:
        res = pool.map(work, [(p, tmp) for p in files], chunksize=1)
        keys = sorted(k for r in res for k in r[3])
        population, total, bad = len(keys), sum(r[1] for r in res), sum(r[2] for r in res)
        if population < want:
            sys.exit(f"대상 {population}건이 요청 {want}건보다 적습니다")
        cut = keys[want - 1]
        del keys
        written = 0
        fill = C.Counter()
        name = f"books_{want // 10000}0k.jsonl" if want % 10000 == 0 and want < 1_000_000 else f"books_{want // 1_000_000}m.jsonl"
        with open(os.path.join(dst, name), "w", encoding="utf-8") as w:
            for r in res:
                with open(r[0], encoding="utf-8") as f:
                    for line in f:
                        b = json.loads(line)
                        if sort_key(b["id"]) <= cut:
                            w.write(line)
                            written += 1
    manifest = {"source": "국립중앙도서관 LOD Offline_json_20261008", "license": "공공누리 제1유형, CC0 1.0",
                "filter": "typeOfData=dt_gm, language=kor, 제목에 한글 포함", "seed": SEED,
                "records_read": total, "parse_failures": bad, "population": population, "written": written,
                "failure_samples": [s for r in res for s in r[4]][:5]}
    json.dump(manifest, open(os.path.join(dst, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(manifest, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
