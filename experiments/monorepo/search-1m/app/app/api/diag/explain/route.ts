import { NextResponse } from "next/server";
import { diagEnabled, explainToken } from "@/lib/diag";

export const dynamic = "force-dynamic";

const notFound = () => new NextResponse(null, { status: 404 });

export async function GET() {
  return diagEnabled() ? NextResponse.json({ error: "POST only" }, { status: 405 }) : notFound();
}

export async function POST(req: Request) {
  if (!diagEnabled()) return notFound();
  const body = await req.json().catch(() => null);
  const token = body && typeof body.token === "string" ? body.token : "";
  const summary = token ? await explainToken(token) : null;
  if (!summary) return NextResponse.json({ error: "invalid token" }, { status: 400 });
  return NextResponse.json(summary);
}
