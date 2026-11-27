import { NextResponse } from "next/server";
import { getBook } from "@/lib/books";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(book);
}
