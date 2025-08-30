import { NextRequest, NextResponse } from "next/server";
import { ChatMessage } from "@/types/types";
import { streamText, ModelMessage } from "ai";
import { openrouter } from "@/lib/ai-models/openrouter";

export async function POST(request: NextRequest) {
  try {
    const { messages }: { messages: ChatMessage[] } = await request.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 }
      );
    }

    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage.sender !== "user") {
      return NextResponse.json(
        { error: "Last message must be from the user" },
        { status: 400 }
      );
    }

    const conversationHistory: ModelMessage[] = messages
      .slice(0, -1)
      .map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.content,
      }));

    const selectedModel = "meta-llama/llama-3.3-8b-instruct:free";

    const result = await streamText({
      model: openrouter.chat(selectedModel),
      messages: [
        ...conversationHistory,
        { role: "user", content: lastUserMessage.content },
      ],
      temperature: 0.7,
      maxOutputTokens: 1024,
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const textPart of result.textStream) {
          controller.enqueue(encoder.encode(textPart));
        }
        controller.close();
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain",
      },
    });
  } catch (error) {
    console.error("API route error (generate-response):", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
