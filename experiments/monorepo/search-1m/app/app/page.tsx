import DiagLoader from "@/components/DiagLoader";
import SearchBox from "@/components/SearchBox";
import { diagEnabled } from "@/lib/diag";

// 진단 플래그를 요청 때마다 읽어야 해서 동적으로 렌더링한다.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div>
      <h1>도서 검색</h1>
      <SearchBox />
      {diagEnabled() && <DiagLoader kind="home" data={null} />}
    </div>
  );
}
