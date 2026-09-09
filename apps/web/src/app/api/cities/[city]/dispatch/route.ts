import { NextResponse } from "next/server";
import { generateDispatch } from "@/server/flood-service";

type Ctx = { params: Promise<{ city: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { city } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { rain?: string };
    const rainMode = body.rain === "live" ? "live" : "replay";
    const plan = await generateDispatch(city, rainMode);
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
