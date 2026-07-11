import { NextRequest, NextResponse } from "next/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

export async function POST(req: NextRequest) {
  const { apiKey } = await req.json();
  if (!apiKey) return NextResponse.json({ valid: false, error: "No key provided" });

  try {
    const google = createGoogleGenerativeAI({ apiKey });
    await generateText({
      model: google("gemini-2.5-flash"),
      prompt: "Say OK",
    });
    return NextResponse.json({ valid: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ valid: false, error: message });
  }
}
