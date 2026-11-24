"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";
import { MAX_QUERY_LENGTH } from "../model/query";

// 검색어 입력창. 입력한 검색어를 브라우저 상태가 아니라 주소(?q=)에 둔다 (#81 2-3a)
// (Next.js Learn "Adding Search and Pagination": useSearchParams · usePathname · useRouter.replace)
// 주소가 바뀌면 검색 페이지(서버)가 searchParams를 받아 결과를 다시 가져온다
// 입력을 멈추고 300ms 뒤에만 주소를 바꾼다 (Learn "Best practice: Debouncing", #81 2-3a ②)
// 한글은 자모를 누를 때마다 입력이 일어나서, 없을 때는 "리엑트"에 백엔드 요청이 8번 나갔다
// 검색어는 1000자까지. 첫 장치로 입력창에서 막고, 끝까지 차면 아래에 안내한다 (#86 ②-1)
// (MDN maxlength: 브라우저가 그 이상 입력되지 않게 막는다. 현업도 붙여 넣으면 1000자까지만 들어가고 안내를 보여 줬다)
//
// 입력창 값을 주소와 맞추기 (#86 ④-1)
// - defaultValue는 처음 값만 정해서, 입력한 뒤 메뉴 클릭 · 뒤로 가기로 주소가 바뀌어도 글자가 남았다 (React <input> "defaultValue")
// - key={q}로 새로 만들면 입력하다 멈출 때마다(300ms) 입력창이 새로 만들어져 포커스가 빠지고 이어 친 글자가 사라졌다
// - 그래서 입력창 값을 state로 두고(제어 컴포넌트), 주소의 검색어가 "내가 마지막으로 넣은 값"과 다를 때만 맞춘다
//   (React "Adjusting some state when a prop changes": 이전 값을 state에 두고 렌더링 중에 비교)
//   입력해서 바뀐 주소는 내가 넣은 값과 같으니 건드리지 않고, 메뉴 · 뒤로 가기처럼 바깥에서 바뀐 경우만 맞춘다
export function SearchBox() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  const urlQ = searchParams.get("q") ?? "";

  const [value, setValue] = useState(urlQ);
  const [prevParams, setPrevParams] = useState(searchParams); // 지난 렌더링의 주소 (이동이 일어났는지 알아보려고)
  const [pushedQ, setPushedQ] = useState(urlQ); // 입력해서 내가 마지막으로 주소에 넣은 값
  if (searchParams !== prevParams) {
    setPrevParams(searchParams);
    if (urlQ !== pushedQ) {
      // 바깥에서 바뀐 주소 (메뉴 클릭 · 뒤로 가기)
      setPushedQ(urlQ);
      setValue(urlQ);
    }
  }

  const handleSearch = useDebouncedCallback((term: string) => {
    setPushedQ(term);
    const params = new URLSearchParams(searchParams);
    if (term) params.set("q", term);
    else params.delete("q");
    replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  }, 300);

  const atLimit = value.length >= MAX_QUERY_LENGTH;

  return (
    <>
      <input
        aria-label="검색어"
        aria-describedby={atLimit ? "search-limit" : undefined}
        value={value}
        maxLength={MAX_QUERY_LENGTH}
        onChange={(e) => {
          setValue(e.target.value);
          handleSearch(e.target.value);
        }}
        // 입력하고 0.3초 안에 메뉴를 누르면, 메뉴 이동 뒤에 남아 있던 검색 예약이 실행돼 메뉴가 무시됐다 (#86 ④-2)
        // 메뉴를 누르면 브라우저가 먼저 입력창 포커스를 빼므로, 그때 예약을 바로 실행해 둔다 (use-debounce flush)
        // → 검색 → 메뉴 이동 순서가 되고, 메뉴 이동은 바깥에서 바뀐 주소라 입력창도 비워진다 (④-1)
        onBlur={() => handleSearch.flush()}
        placeholder="제목으로 검색"
      />
      {atLimit && (
        <p id="search-limit" role="status">
          검색어는 {MAX_QUERY_LENGTH}자까지만 입력할 수 있습니다.
        </p>
      )}
    </>
  );
}
