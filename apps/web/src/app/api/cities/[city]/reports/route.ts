import { NextResponse } from "next/server";
import { submitReport } from "@/server/flood-service";

type Ctx = { params: Promise<{ city: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { city } = await ctx.params;
    const body = (await req.json()) as {
      lat?: number;
      lon?: number;
      note?: string;
      waterDetected?: boolean;
      depthCue?: "ankle" | "knee" | "vehicle" | "unknown";
      photoBase64?: string;
    };
    if (typeof body.lat !== "number" || typeof body.lon !== "number") {
      return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
    }
    const report = await submitReport({
      city,
      lat: body.lat,
      lon: body.lon,
      note: body.note ?? "",
      waterDetected: body.waterDetected ?? true,
      depthCue: body.depthCue ?? "knee",
      photoBase64: body.photoBase64,
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
