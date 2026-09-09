import { NextResponse } from "next/server";
import { getDashboard } from "@/server/flood-service";

type Ctx = { params: Promise<{ city: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { city } = await ctx.params;
    const url = new URL(req.url);
    const rainMode = url.searchParams.get("rain") === "live" ? "live" : "replay";
    const data = await getDashboard(city, rainMode);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
