import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fetchJobDescription } from "@/lib/import/url";

const schema = z.object({ url: z.string().url().max(2048) });

export async function POST(request: Request) {
  try {
    await requireUser();
    const { url } = schema.parse(await request.json());
    const job = await fetchJobDescription(url, { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3 });
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import this URL." }, { status: 400 });
  }
}
