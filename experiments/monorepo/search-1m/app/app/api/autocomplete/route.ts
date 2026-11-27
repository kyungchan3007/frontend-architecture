import { NextRequest, NextResponse } from "next/server";
import { autocomplete } from "@/lib/books";
import { withDiag } from "@/lib/diag";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const { value, diag } = await withDiag(() => autocomplete(q));
  return NextResponse.json(diag ? { ...value, _diag: diag } : value);
}
