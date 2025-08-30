import { streamText, ModelMessage } from 'ai';
import { openrouter, OPENROUTER_MODELS } from '../ai-models/openrouter';

export class AIService {

  /**
   * Determines the appropriate AI model based on the user's prompt.
   * This is a heuristic-based selection for demonstration.
   * In a real-world scenario, you might use a small, fast model for classification
   * or more sophisticated NLP techniques.
   */
  private static _determineModelForPrompt(prompt: string): string {
    const lowerCasePrompt = prompt.toLowerCase().trim();

    // Simple greetings or short messages
    if (lowerCasePrompt.length < 20 ||
        ["hi", "hello", "hey", "thanks", "thank you", "bye", "goodbye"].some(keyword => lowerCasePrompt.includes(keyword))) {
      console.log("Using LITE_MODEL for simple prompt.");
      return OPENROUTER_MODELS.LITE_MODEL; // Use the cheapest model for simple interactions
    }

    // Prompts indicating complex or detailed tasks (e.g., long, contains questions)
    if (lowerCasePrompt.length > 100 || lowerCasePrompt.includes("how to") || lowerCasePrompt.includes("what is") || lowerCasePrompt.includes("explain")) {
      console.log("Using HEAVY_QWEN2_72B for complex prompt.");
      return OPENROUTER_MODELS.HEAVY_QWEN2_72B; // Use the most powerful model
    }

    // Default to a balanced model for general queries
    console.log("Using BALANCED_MISTRAL_7B for general prompt.");
    return OPENROUTER_MODELS.BALANCED_MISTRAL_7B;
  }

  static async *generateResponse(
    prompt: string,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): AsyncIterable<string> {
    try {
      // Determine the model to use based on the current prompt
      const selectedModel = AIService._determineModelForPrompt(prompt);
      
      // Map conversation history to the format expected by @ai-sdk/core
      const messages: ModelMessage[] = conversationHistory.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant', // Ensure roles are 'user' or 'assistant'
        content: msg.content,
      }));

      // Add the current user prompt
      messages.push({ role: 'user', content: prompt });

      // Use streamText from @ai-sdk/core with the openrouter provider
      const result = await streamText({
        model: openrouter.chat(selectedModel), // Pass the specific model from openrouter provider
        messages: messages,
        temperature: 0.7,
        maxOutputTokens: 1024,
      });

      // The result.text is an AsyncIterable<string> directly
      for await (const textPart of result.textStream) {
        yield textPart;
      }
    } catch (error) {
      console.error("AI Service Error generating response:", error);
      throw new Error("Failed to generate AI response");
    }
  }

  static async generateChatTitle(firstUserMessage: string): Promise<string> {
    try {
      // Always use a lightweight model for title generation
      const titleModel = OPENROUTER_MODELS.LITE_MODEL;
      console.log(`Generating title with model: ${titleModel}`);

      const prompt = `You are a helpful assistant that generates concise, creative, and unique titles for chat conversations.
      Based on the following user's first message, provide a short title (max 5-7 words) that hints at the conversation's potential topic or is a creative take on the initial interaction.
      Do not include any conversational phrases or greetings, just the title.

User message: '${firstUserMessage}'

Title:`;

      const result = await streamText({
        model: openrouter.chat(titleModel),
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        maxOutputTokens: 50, // Small output for titles
      });

      // Collect the full response for the title
      let title = '';
      for await (const textPart of result.textStream) {
        title += textPart;
      }
      title = title.trim();

      // Basic cleanup: remove quotes if the AI wraps the title in them
      if (title.startsWith('"') && title.endsWith('"')) {
        title = title.substring(1, title.length - 1);
      }
      // Ensure it's not too long
      const words = title.split(/\s+/);
      if (words.length > 7) {
        title = words.slice(0, 7).join(" ") + "...";
      }

      return title;
    } catch (error) {
      console.error("AI Service Error generating chat title:", error);
      throw new Error("Failed to generate AI chat title");
    }
  }

  // --- Future-proofing: Commented out direct integrations for other providers ---

  // Example for OpenAI (ChatGPT) direct integration using @ai-sdk/openai
  /*
  static async *generateOpenAIResponse(
    prompt: string,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): AsyncIterable<string> {
    if (!openai) {
      throw new Error("OpenAI client not initialized. Check OPENAI_API_KEY.");
    }
    try {
      const messages: CoreMessage[] = conversationHistory.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));
      messages.push({ role: 'user', content: prompt });

      const result = await streamText({
        model: openai.chat(OPENAI_MODELS.GPT_3_5_TURBO), // Or GPT_4O
        messages: messages,
      });

      for await (const textPart of result.textStream) {
        yield textPart;
      }
    } catch (error) {
      console.error("OpenAI Service Error:", error);
      throw new Error("Failed to generate OpenAI response");
    }
  }
  */

  // Example for Google Gemini direct integration using @ai-sdk/google
  /*
  static async *generateGeminiResponse(
    prompt: string,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): AsyncIterable<string> {
    if (!google) {
      throw new Error("Gemini client not initialized. Check GEMINI_API_KEY.");
    }
    try {
      const messages: CoreMessage[] = conversationHistory.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model', // Gemini uses 'model' for assistant
        content: msg.content,
      }));
      messages.push({ role: 'user', content: prompt });

      const result = await streamText({
        model: google.chat(GEMINI_MODELS.GEMINI_1_5_FLASH),
        messages: messages,
      });

      for await (const textPart of result.textStream) {
        yield textPart;
      }
    } catch (error) {
      console.error("Gemini Service Error:", error);
      throw new Error("Failed to generate Gemini response");
    }
  }
  */
}
