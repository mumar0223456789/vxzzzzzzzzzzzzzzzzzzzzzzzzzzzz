"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import { ChatMessage, Conversation } from "@/types/types";
import { useUser } from "@/context/UserContext";
import axios from "@/lib/axios";

const CONVERSATIONS_KEY = "conversations";
const CONVERSATION_KEY = "conversation";
const MESSAGES_KEY_PREFIX = "messages";

export const useConversations = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: [CONVERSATIONS_KEY, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const response = await axios.get<Conversation[]>("/api/conversations");
      return response.data;
    },
    enabled: !!user?.id,
  });
};

export const useConversation = (id: string | null) => {
  const { user } = useUser();
  return useQuery({
    queryKey: [CONVERSATION_KEY, id, user?.id],
    queryFn: async () => {
      if (!id || !user?.id) return null;
      const response = await axios.get<Conversation>(
        `/api/conversations/${id}`
      );
      return response.data;
    },
    enabled: !!id && !!user?.id,
  });
};

export const useMessages = (conversationId: string | null) => {
  const { user } = useUser();
  return useQuery({
    queryKey: [MESSAGES_KEY_PREFIX, conversationId, user?.id],
    queryFn: async () => {
      if (!conversationId || !user?.id) return [];
      const response = await axios.get<ChatMessage[]>(
        `/api/conversations/${conversationId}/messages`
      );
      return response.data;
    },
    enabled: !!conversationId && !!user?.id,
    initialData: [],
  });
};

export const useCreateConversation = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async ({
      firstMessage, // This is the correct variable name
    }: {
      firstMessage: string;
    }): Promise<{ conversationId: string; conversation: Conversation }> => {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }

      const newConversationId = uuidv4();

      const newConversation: Conversation = {
        id: newConversationId,
        userId: user.id,
        title: "New Chat", // Initial title
        created_at: new Date().toISOString(),
        isTitleGenerating: true, // Indicate that title is being generated
      };

      // Optimistically update the conversations list
      queryClient.setQueryData(
        [CONVERSATIONS_KEY, user.id],
        (oldConversations: Conversation[] | undefined) => {
          return [newConversation, ...(oldConversations || [])];
        }
      );

      // 1. Create the conversation in the database
      const createConversationResponse = await axios.post<Conversation>(
        "/api/conversations",
        { id: newConversation.id, title: newConversation.title }
      );
      const createdConversation = createConversationResponse.data;

      // Ensure the newConversation object reflects the actual created ID if different (though it should be the same)
      newConversation.id = createdConversation.id;

      // 2. Save the user's first message
      const userMessage: ChatMessage = {
        id: uuidv4(),
        sender: "user",
        content: firstMessage,
        created_at: new Date().toISOString(),
        userId: user.id,
        conversationId: newConversation.id,
      };
      await axios.post("/api/messages", userMessage);

      // Optimistically update messages for the new conversation
      queryClient.setQueryData(
        [MESSAGES_KEY_PREFIX, newConversation.id, user.id],
        [userMessage]
      );

      // 3. Generate chat title via the new API route
      // CORRECTED LINE: Pass firstMessage as firstUserMessage
      axios.post<{ title: string }>("/api/generate-title", { firstUserMessage: firstMessage })
        .then(async (response) => {
          const generatedTitle = response.data.title;
          // Update conversation title in the database
          await axios.put(`/api/conversations/${newConversation.id}`, {
            title: generatedTitle,
          });

          // Update the cache for conversations list
          queryClient.setQueryData(
            [CONVERSATIONS_KEY, user.id],
            (oldConversations: Conversation[] | undefined) => {
              return (oldConversations || []).map((conv) =>
                conv.id === newConversation.id
                  ? { ...conv, title: generatedTitle, isTitleGenerating: false }
                  : conv
              );
            }
          );
          // Update the cache for the specific conversation
          queryClient.setQueryData(
            [CONVERSATION_KEY, newConversation.id, user.id],
            (oldConv: Conversation | undefined) =>
              oldConv
                ? {
                    ...oldConv,
                    title: generatedTitle,
                    isTitleGenerating: false,
                  }
                : oldConv
          );
        })
        .catch((error) => {
          console.error("Failed to generate chat title via API:", error);
          // If title generation fails, ensure isTitleGenerating is set to false
          queryClient.setQueryData(
            [CONVERSATIONS_KEY, user.id],
            (oldConversations: Conversation[] | undefined) => {
              return (oldConversations || []).map((conv) =>
                conv.id === newConversation.id
                  ? { ...conv, isTitleGenerating: false }
                  : conv
              );
            }
          );
          queryClient.setQueryData(
            [CONVERSATION_KEY, newConversation.id, user.id],
            (oldConv: Conversation | undefined) =>
              oldConv ? { ...oldConv, isTitleGenerating: false } : oldConv
          );
        });

      return {
        conversationId: newConversation.id,
        conversation: newConversation,
      };
    },
    onSettled: () => {
      // Invalidate queries to refetch conversations after mutation settles
      queryClient.invalidateQueries({
        queryKey: [CONVERSATIONS_KEY, user?.id],
      });
    },
  });
};

export const useSaveMessage = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async (message: ChatMessage) => {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }
      const messageToSave = { ...message, userId: user.id };

      // Optimistically update the messages cache
      queryClient.setQueryData(
        [MESSAGES_KEY_PREFIX, message.conversationId, user.id],
        (oldMessages: ChatMessage[] | undefined) => {
          const existingMessageIndex = (oldMessages || []).findIndex(
            (msg) => msg.id === message.id
          );
          if (existingMessageIndex !== -1) {
            // Update existing message (e.g., for AI response chunks)
            const updatedMessages = [...(oldMessages || [])];
            updatedMessages[existingMessageIndex] = messageToSave;
            return updatedMessages;
          } else {
            // Add new message
            return [...(oldMessages || []), messageToSave];
          }
        }
      );

      // Send message to the database
      const response = await axios.post<ChatMessage>(
        "/api/messages",
        messageToSave
      );
      const savedMessage = response.data;

      // Invalidate to ensure fresh data, especially if optimistic update was not perfect
      queryClient.invalidateQueries({
        queryKey: [MESSAGES_KEY_PREFIX, message.conversationId, user.id],
      });

      return savedMessage;
    },
  });
};

export const useUpdateConversation = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }

      // This PUT request is primarily to update the `updatedAt` timestamp
      await axios.put(`/api/conversations/${conversationId}`, {});

      // Invalidate relevant queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: [CONVERSATIONS_KEY, user.id] });
      queryClient.invalidateQueries({
        queryKey: [CONVERSATION_KEY, conversationId, user.id],
      });

      return { conversationId };
    },
  });
};
