"""표지 대체 이미지 20종을 만든다. 합성 데이터이며 시드 고정.

사용법: python3 -I generate_covers.py <출력 폴더>
PNG를 표준 라이브러리로 만든 뒤 macOS sips로 JPEG로 바꾼다. 목표 크기는 200~300KB.
"""
import os
import random
import struct
import subprocess
import sys
import zlib

W, H = 800, 1160
QUALITY = "65"


def png(path, rows):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    raw = b"".join(b"\x00" + r for r in rows)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 1)) + chunk(b"IEND", b""))


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    sizes = []
    for n in range(1, 21):
        rng = random.Random(1000 + n)
        a = [rng.randrange(40, 220) for _ in range(3)]
        b = [rng.randrange(40, 220) for _ in range(3)]
        rows = []
        for y in range(H):
            t = y / (H - 1)
            base = [int(a[c] * (1 - t) + b[c] * t) for c in range(3)]
            row = bytearray(W * 3)
            for x in range(W):
                noise = rng.randrange(-14, 15)
                for c in range(3):
                    row[x * 3 + c] = max(0, min(255, base[c] + noise))
            rows.append(bytes(row))
        tmp = os.path.join(out, f".cover-{n:02d}.png")
        dst = os.path.join(out, f"cover-{n:02d}.jpg")
        png(tmp, rows)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", QUALITY, tmp, "--out", dst],
                       check=True, capture_output=True)
        os.remove(tmp)
        sizes.append(os.path.getsize(dst))
    print("count", len(sizes), "min_kb", min(sizes) // 1024, "max_kb", max(sizes) // 1024)


if __name__ == "__main__":
    main()
