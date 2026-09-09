import { NextResponse } from "next/server";
import {
  loadAssets,
  updateAssetAvailability,
} from "@/server/flood-service";

type Ctx = { params: Promise<{ city: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { city } = await ctx.params;
    const assets = await loadAssets(city);
    return NextResponse.json({ assets });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { city } = await ctx.params;
    const body = (await req.json()) as { id?: string; available?: boolean };
    if (!body.id || typeof body.available !== "boolean") {
      return NextResponse.json({ error: "id and available required" }, { status: 400 });
    }
    const assets = await updateAssetAvailability(city, body.id, body.available);
    return NextResponse.json({ assets });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
