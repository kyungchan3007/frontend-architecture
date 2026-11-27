import { hashId } from "./hash";

export type Holding = { status: "available" | "loaned" };

// DB를 쓰지 않는 가짜 소장 상태 조회. 100ms 지연 후 id 해시로 고정된 상태를 돌려준다.
export async function getHolding(id: string): Promise<Holding> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { status: hashId(id) % 3 === 0 ? "loaned" : "available" };
}
