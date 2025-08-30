import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import dotenv from "dotenv";

dotenv.config();

const OPENROUTER_API_KEY =
  "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";

if (!OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is not configured");
}

export const openrouter = createOpenRouter({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
});

// Define the models you'll be using with their OpenRouter identifiers
export const OPENROUTER_MODELS = {
  LITE_MODEL: "meta-llama/llama-3.3-8b-instruct:free",

  // Balanced speed & power
  BALANCED_MISTRAL_7B: "mistralai/mistral-7b-instruct-v0.2:free",
  BALANCED_MISTRAL_NEMO: "mistralai/mistral-nemo:free",

  // Heavy, detailed tasks
  HEAVY_QWEN2_72B: "qwen/qwen2-72b-instruct",
  MULTIMODAL_LLAMA_VISION: "meta-llama/llama-3.1-405b-instruct-vision",
};
