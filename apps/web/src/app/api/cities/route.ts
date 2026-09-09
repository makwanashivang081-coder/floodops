import { NextResponse } from "next/server";
import { listCities } from "@/server/flood-service";

export async function GET() {
  try {
    const cities = await listCities();
    return NextResponse.json({ cities });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
