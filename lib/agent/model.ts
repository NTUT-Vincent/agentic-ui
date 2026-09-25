import "server-only";
import { ChatGoogle } from "@langchain/google";

const modelName = process.env.GOOGLE_MODEL ?? "gemini-2.5-flash";
const temperature = Number(process.env.GOOGLE_TEMPERATURE ?? "0.3");

if (!process.env.GOOGLE_API_KEY) {
  throw new Error("GOOGLE_API_KEY is not configured");
}

export const model = new ChatGoogle({
  model: modelName,
  apiKey: process.env.GOOGLE_API_KEY,
  temperature,
});
