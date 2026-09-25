import { EventType } from "@ag-ui/core";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { convertToA2UI } from "@/lib/a2ui/converter";
import type { AgentEvent } from "@/lib/agui/events";
import { generateUiSchema, generateUiTool } from "./generate-ui-tool";
import { model } from "./model";

type RunAgentOptions = {
  prompt: string;
  send: (event: AgentEvent) => void;
};

function readTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String(part.text ?? "");
      return "";
    })
    .join("");
}

export async function runAgent({ prompt, send }: RunAgentOptions) {
  const modelWithTools = model.bindTools([generateUiTool]);
  const result = await modelWithTools.invoke([
    new SystemMessage(`You are an AI assistant in a generative UI demo.
Use plain text for simple conversational or factual answers.
Use generate_ui when the answer is naturally structured, such as plans, itineraries, comparisons, or grouped recommendations.
When using generate_ui, keep the UI concise and useful.`),
    new HumanMessage(prompt),
  ]);

  const uiToolCall = result.tool_calls?.find((call) => call.name === "generate_ui");
  if (uiToolCall) {
    const parsed = generateUiSchema.parse(uiToolCall.args);
    const surfaceId = crypto.randomUUID();
    for (const message of convertToA2UI(parsed, surfaceId)) {
      send({ type: EventType.CUSTOM, name: "a2ui", value: message });
    }
    return;
  }

  const messageId = crypto.randomUUID();
  send({ type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" });
  send({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: readTextContent(result.content) });
  send({ type: EventType.TEXT_MESSAGE_END, messageId });
}
