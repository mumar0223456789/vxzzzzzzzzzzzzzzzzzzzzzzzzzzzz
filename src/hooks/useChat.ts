"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSaveMessage } from "./conversation/useConversations";
import { ChatMessage } from "@/types/types";

export const useChat = () => {
  const saveMessage = useSaveMessage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      messages,
      pendingMessageId,
    }: {
      conversationId: string;
      messages: ChatMessage[];
      pendingMessageId: string;
    }) => {
      let fullAiResponseContent = "";

      const controller = new AbortController();
      const timeoutMs = 60000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        // Direct fetch call to the new API route for streaming
        const res = await fetch("/api/generate-response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const errMsg =
            errorData?.error ??
            errorData?.content ??
            `Request failed with status ${res.status}`;
          throw new Error(errMsg);
        }

        if (!res.body) {
          throw new Error("Response body is empty.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            fullAiResponseContent += chunk;

            queryClient.setQueryData(
              ["messages", conversationId],
              (oldMessages: ChatMessage[] | undefined) => {
                if (!oldMessages) return [];

                const updatedMessages = oldMessages.map((msg) =>
                  msg.id === pendingMessageId
                    ? { ...msg, isGenerating: true }
                    : msg
                );
                return updatedMessages;
              }
            );
          }
        }

        const assistantMessage: ChatMessage = {
          id: pendingMessageId,
          sender: "ai",
          content: fullAiResponseContent,
          created_at: new Date().toISOString(),
          userId: messages[0]?.userId || "placeholder-user-id",
          conversationId,
          isGenerating: false,
        };

        await saveMessage.mutateAsync(assistantMessage);

        return assistantMessage;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error("Request timed out. Please try again.");
        }
        console.error("Chat API error:", err);
        const errorMessageContent =
          "Sorry, I encountered an error. Please make sure your API key is set correctly in the environment variables.";
        const errorMessage: ChatMessage = {
          id: pendingMessageId,
          sender: "ai",
          content: errorMessageContent,
          created_at: new Date().toISOString(),
          userId: messages[0]?.userId || "placeholder-user-id",
          conversationId,
          isGenerating: false,
        };

        queryClient.setQueryData(
          ["messages", conversationId],
          (oldMessages: ChatMessage[] | undefined) => {
            if (!oldMessages) return [];
            return oldMessages.map((msg) =>
              msg.id === pendingMessageId
                ? { ...msg, content: errorMessageContent }
                : msg
            );
          }
        );

        await saveMessage.mutateAsync(errorMessage);
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },
  });
};
