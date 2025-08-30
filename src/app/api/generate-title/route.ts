import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { openrouter, OPENROUTER_MODELS } from "@/lib/ai-models/openrouter";

export async function POST(request: NextRequest) {
  try {
    const { firstUserMessage }: { firstUserMessage: string } =
      await request.json();

    if (!firstUserMessage) {
      return NextResponse.json(
        { error: "First user message is required" },
        { status: 400 }
      );
    }

    const titleModel = OPENROUTER_MODELS.LITE_MODEL;

    const prompt = `You are a helpful assistant that generates concise, creative, and unique titles for chat conversations.
    Based on the following user's first message, provide a short title (max 5-7 words) that hints at the conversation's potential topic or is a creative take on the initial interaction.
    Do not include any conversational phrases or greetings, just the title.

    User message: '${firstUserMessage}'

    Title:`;

    const result = await streamText({
      model: openrouter.chat(titleModel),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      maxOutputTokens: 50,
    });

    let title = "";
    for await (const textPart of result.textStream) {
      title += textPart;
    }
    title = title.trim();

    if (title.startsWith('"') && title.endsWith('"')) {
      title = title.substring(1, title.length - 1);
    }

    const words = title.split(/\s+/);
    if (words.length > 7) {
      title = words.slice(0, 7).join(" ") + "...";
    }

    return NextResponse.json({ title }, { status: 200 });
  } catch (error) {
    console.error("API route error (generate-title):", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
