import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { uploadsDir } from "@/server/paths";

type Ctx = { params: Promise<{ name: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  if (!/^[\w.-]+$/.test(name)) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }
  const file = path.join(uploadsDir(), name);
  try {
    const buf = await fs.readFile(file);
    const ext = name.split(".").pop()?.toLowerCase();
    const type =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : "image/jpeg";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
