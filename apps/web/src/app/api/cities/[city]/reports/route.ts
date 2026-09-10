import { NextResponse } from "next/server";
import { ReportRejectedError } from "@/server/report-errors";
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
      waterDetected: body.waterDetected ?? false,
      depthCue: body.depthCue ?? "unknown",
      photoBase64: body.photoBase64,
    });
    return NextResponse.json({ accepted: true, report }, { status: 201 });
  } catch (e) {
    if (e instanceof ReportRejectedError) {
      return NextResponse.json(
        { accepted: false, verdict: "false_report", error: e.message },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
