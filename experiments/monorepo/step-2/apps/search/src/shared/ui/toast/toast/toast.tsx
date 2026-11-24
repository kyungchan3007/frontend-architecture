"use client";

import { useEffect, useState, type ReactNode } from "react";

// 화면 아래에 띄우는 알림 (#86 ②-2). 앱에 토스트가 없어서 검색 앱 shared에 만들었다 (③ 오류 화면에서도 쓸 예정)
// (MDN ARIA alert role) alert는 처음부터 있는 내용이 아니라 나중에 들어온 내용만 읽어 주므로,
// 화면이 붙은 뒤(useEffect) 문구를 넣는다. 버튼 같은 조작 요소는 alert 안에 두지 않는다
export function Toast({ message, action }: { message: string; action?: ReactNode }) {
  const [text, setText] = useState("");
  useEffect(() => setText(message), [message]);

  return (
    <div className="fixed inset-x-0 bottom-6 mx-auto flex w-fit items-center gap-3 rounded bg-black px-4 py-3 text-white">
      <p role="alert">{text}</p>
      {action}
    </div>
  );
}
