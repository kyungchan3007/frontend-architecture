"use client";

import dynamic from "next/dynamic";

// 패널 코드는 이 import()가 실행될 때만 내려받는다. 진단이 꺼져 있으면 이 컴포넌트를 렌더링하지 않는다.
const DiagPanel = dynamic(() => import("./DiagPanel"), { ssr: false });

export default DiagPanel;
