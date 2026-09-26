import { EventType } from "@ag-ui/core";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { model } from "@/lib/agent/model";
import type { AgentEvent } from "@/lib/agui/events";
import type { SharedAppState } from "../state/types";
import type { DayFlowAgentContext } from "./context";
import { buildStateDelta, updateAppStateSchema, updateAppStateTool } from "./update-state-tool";
function text(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((p) => typeof p === "string" ? p : p && typeof p === "object" && "text" in p ? String(p.text ?? "") : "").join("");
}
function sendText(send: (event: AgentEvent) => void, value: string) {
  const messageId = crypto.randomUUID();
  send({ type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" });
  send({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: value });
  send({ type: EventType.TEXT_MESSAGE_END, messageId });
}
export async function runDayFlowAgent(opts: { prompt: string; state: SharedAppState; context: DayFlowAgentContext; send: (event: AgentEvent) => void }) {
  const result = await model.bindTools([updateAppStateTool]).invoke([
    new SystemMessage(`You are DayFlow, an AI copilot embedded in an existing city discovery web app. Prefer operating the app through update_app_state over describing manual steps. Never invent place IDs, ratings, or reviews. Only select/add IDs in context. If the user requests another city, set locationQuery and let the browser resolve coordinates. Keep follow-up text concise.\nSTATE:\n${JSON.stringify(opts.state)}\nCONTEXT:\n${JSON.stringify(opts.context)}`),
    new HumanMessage(opts.prompt),
  ]);
  const call = result.tool_calls?.find((item) => item.name === "update_app_state");
  if (call) {
    const input = updateAppStateSchema.parse(call.args);
    const visibleIds = new Set(opts.context.visiblePlaces.map((place) => place.id));
    const knownPlanIds = new Set(opts.state.plan.placeIds);
    for (const id of [input.selectedPlaceId, input.addToPlan]) {
      if (id && !visibleIds.has(id)) throw new Error(`Agent attempted to use unknown place id: ${id}`);
    }
    if (input.removeFromPlan && !visibleIds.has(input.removeFromPlan) && !knownPlanIds.has(input.removeFromPlan)) {
      throw new Error(`Agent attempted to remove unknown plan item: ${input.removeFromPlan}`);
    }
    const delta = buildStateDelta(input, opts.state);
    if (delta.length) opts.send({ type: EventType.STATE_DELTA, delta });
    sendText(opts.send, input.message);
    return;
  }
  sendText(opts.send, text(result.content) || "I couldn't find an action to perform.");
}
