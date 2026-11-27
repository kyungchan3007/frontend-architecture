import { NextRequest, NextResponse } from "next/server";
import { searchBooks } from "@/lib/books";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const result = await searchBooks({
    q: p.get("q") ?? "",
    kdc: p.get("kdc") ?? undefined,
    sort: p.get("sort") ?? undefined,
    page: Number(p.get("page") ?? 1),
  });
  return NextResponse.json(result);
}
