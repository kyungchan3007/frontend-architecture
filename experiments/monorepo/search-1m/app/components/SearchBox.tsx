"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { type: "title" | "author"; text: string };

export default function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [shown, setShown] = useState<{ query: string; items: Item[] } | null>(null);
  const lastRequested = useRef<string | null>(null);

  async function request(q: string) {
    lastRequested.current = q;
    if (!q) {
      setShown(null);
      return;
    }
    const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setShown({ query: data.query, items: data.items });
  }

  return (
    <div>
      <input
        type="search"
        data-testid="search-input"
        placeholder="제목이나 저자를 입력하세요"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if ((e.nativeEvent as InputEvent).isComposing) return;
          request(e.target.value);
        }}
        onCompositionEnd={(e) => {
          const v = e.currentTarget.value;
          if (v !== lastRequested.current) request(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            router.push(`/search?q=${encodeURIComponent(e.currentTarget.value)}`);
          }
        }}
      />
      {shown && (
        <ul className="ac" data-testid="autocomplete-list" data-query={shown.query}>
          {shown.items.map((it) => (
            <li key={`${it.type}:${it.text}`}>
              <Link prefetch={false} href={`/search?q=${encodeURIComponent(it.text)}`}>
                <span className="tag">{it.type === "title" ? "제목" : "저자"}</span>
                {it.text}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
