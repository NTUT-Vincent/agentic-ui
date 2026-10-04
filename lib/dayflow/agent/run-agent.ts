import { EventType } from "@ag-ui/core";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { model } from "@/lib/agent/model";
import type { AgentEvent } from "@/lib/agui/events";
import { MAX_AGENT_STEPS, type AgentDependency, type SharedAppState } from "../state/types";
import type { DayFlowAgentContext } from "./context";
import {
  actionNeedsPlaceContext,
  applyActionToState,
  buildActionDelta,
  dependenciesForAction,
  parseUpdateAppStateInput,
  type UpdateAppStateAction,
  updateAppStateTool,
} from "./update-state-tool";

const MODEL_TIMEOUT_MS = 30_000;
const MODEL_MAX_RETRIES = 2;

function text(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "string" ? part : part && typeof part === "object" && "text" in part ? String(part.text ?? "") : "").join("");
}

function sendText(send: (event: AgentEvent) => void, value: string) {
  const messageId = crypto.randomUUID();
  send({ type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" });
  send({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: value });
  send({ type: EventType.TEXT_MESSAGE_END, messageId });
}

function placeName(context: DayFlowAgentContext, placeId: string) {
  return context.visiblePlaces.find((place) => place.id === placeId)?.name ?? "place";
}

function actionResult(action: UpdateAppStateAction, context: DayFlowAgentContext): string {
  switch (action.type) {
    case "set_location": return `Location set to ${action.locationQuery}`;
    case "set_categories": return action.categories.length ? `Categories set to ${action.categories.join(", ")}` : "Category filters cleared";
    case "set_radius": return `Search radius set to ${action.radiusKm} km`;
    case "set_environment": return `Environment set to ${action.environment}`;
    case "set_sort": return `Sorting by ${action.sortBy}`;
    case "set_view": return `View switched to ${action.view}`;
    case "select_place": return action.placeId ? `Opened ${placeName(context, action.placeId)}` : "Place selection cleared";
    case "add_to_plan": return `Added ${placeName(context, action.placeId)} to My Plan`;
    case "remove_from_plan": return `Removed ${placeName(context, action.placeId)} from My Plan`;
    case "set_plan_days": return `Trip length set to ${action.days} day${action.days === 1 ? "" : "s"}`;
    case "set_plan_start_date": return action.startDate ? `Trip starts ${action.startDate}` : "Trip start date cleared";
    case "set_plan_start_time": return `Daily start set to ${action.time}`;
    case "set_plan_end_time": return `Daily end set to ${action.time}`;
    case "set_plan_pace": return `Trip pace set to ${action.pace}`;
    case "set_plan_note": return "Planner note updated";
    case "reset_filters": return "Filters reset";
  }
}

function validateAction(action: UpdateAppStateAction, state: SharedAppState, context: DayFlowAgentContext) {
  const visibleIds = new Set(context.visiblePlaces.map((place) => place.id));
  if (action.type === "select_place" && action.placeId && !visibleIds.has(action.placeId)) throw new Error(`Agent attempted to select unknown place id: ${action.placeId}`);
  if (action.type === "add_to_plan" && !visibleIds.has(action.placeId)) throw new Error(`Agent attempted to add unknown place id: ${action.placeId}`);
  if (action.type === "remove_from_plan" && !state.plan.placeIds.includes(action.placeId)) throw new Error(`Agent attempted to remove unknown plan item: ${action.placeId}`);
}

function emitAction(send: (event: AgentEvent) => void, action: UpdateAppStateAction, state: SharedAppState, context: DayFlowAgentContext) {
  const toolCallId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const delta = buildActionDelta(action, state);
  send({ type: EventType.TOOL_CALL_START, toolCallId, toolCallName: "update_app_state" });
  send({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(action) });
  send({ type: EventType.TOOL_CALL_END, toolCallId });
  if (delta.length) send({ type: EventType.STATE_DELTA, delta });
  send({ type: EventType.TOOL_CALL_RESULT, messageId, toolCallId, content: actionResult(action, context), role: "tool" });
}

function actionChangesContext(action: UpdateAppStateAction, before: SharedAppState, after: SharedAppState) {
  switch (action.type) {
    case "set_location": return before.location.query !== after.location.query;
    case "set_radius": return before.filters.radiusKm !== after.filters.radiusKm;
    case "set_categories": return JSON.stringify(before.filters.categories) !== JSON.stringify(after.filters.categories);
    case "set_environment": return before.filters.environment !== after.filters.environment;
    case "reset_filters": return before.filters.radiusKm !== after.filters.radiusKm || before.filters.environment !== after.filters.environment || JSON.stringify(before.filters.categories) !== JSON.stringify(after.filters.categories);
    default: return false;
  }
}

function emitContinuation(opts: { goal: string; step: number; runId: string; send: (event: AgentEvent) => void }, dependencies: Set<AgentDependency>) {
  if (opts.step >= MAX_AGENT_STEPS) {
    sendText(opts.send, "I reached the automation step limit before I could complete every requested action.");
    return false;
  }
  opts.send({
    type: EventType.CUSTOM,
    name: "dayflow:continue",
    value: { goal: opts.goal, step: opts.step + 1, maxSteps: MAX_AGENT_STEPS, previousRunId: opts.runId, waitFor: [...dependencies] },
  });
  return true;
}

export async function runDayFlowAgent(opts: {
  goal: string;
  step: number;
  previousRunId?: string | null;
  runId: string;
  state: SharedAppState;
  context: DayFlowAgentContext;
  send: (event: AgentEvent) => void;
}) {
  const messages = [
    new SystemMessage(`You are DayFlow, an AI copilot embedded in an existing city discovery and itinerary-planning web app.

Operate the existing UI with update_app_state. Use multiple ordered actions in one tool call when current STATE and CONTEXT are sufficient. Never invent place IDs or place facts. Only select or add place IDs present in CONTEXT.visiblePlaces.

The planner form is shared application state. When the user asks to change trip settings, operate the form directly:
- set_plan_days -> days (1-14)
- set_plan_start_date -> startDate (YYYY-MM-DD or null)
- set_plan_start_time -> time (HH:mm)
- set_plan_end_time -> time (HH:mm)
- set_plan_pace -> pace (relaxed, balanced, packed)
- set_plan_note -> note

Other action fields:
- set_location -> locationQuery
- set_categories -> categories
- set_radius -> radiusKm
- set_environment -> environment
- set_sort -> sortBy
- set_view -> view
- select_place / add_to_plan / remove_from_plan -> placeId
- reset_filters -> no extra value field

Before calling the tool, compare the requested goal against current STATE. Do not emit actions that leave state unchanged. If the entire goal is already satisfied, respond briefly without a tool call.

Changing location, radius, categories, environment, or resetting filters can require refreshed browser context. When fresh context is needed before finishing the goal, execute only safe actions now and set continueAfterRefresh=true. On continuation, inspect the refreshed STATE and CONTEXT and do not repeat completed actions.

Changing planner fields updates the visible form immediately. It does not itself generate the itinerary; the user can use Generate itinerary in the planner workspace after settings are ready.

This is execution step ${opts.step} of at most ${MAX_AGENT_STEPS}.${opts.previousRunId ? ` Previous run: ${opts.previousRunId}.` : ""}

STATE:
${JSON.stringify(opts.state)}

CONTEXT:
${JSON.stringify(opts.context)}`),
    new HumanMessage(opts.goal),
  ];

  const modelStartedAt = Date.now();
  let result;
  try {
    result = await model.bindTools([updateAppStateTool]).invoke(messages, { timeout: MODEL_TIMEOUT_MS, maxRetries: MODEL_MAX_RETRIES });
    console.log("[DayFlow][model:finish]", { runId: opts.runId, step: opts.step, durationMs: Date.now() - modelStartedAt, toolCallCount: result.tool_calls?.length ?? 0 });
  } catch (error) {
    console.error("[DayFlow][model:error]", { runId: opts.runId, step: opts.step, durationMs: Date.now() - modelStartedAt, error });
    throw error;
  }

  const call = result.tool_calls?.find((item) => item.name === "update_app_state");
  if (!call) {
    sendText(opts.send, text(result.content) || "I couldn't find an action to perform.");
    return;
  }

  const input = parseUpdateAppStateInput(call.args);
  let workingState = opts.state;
  const refreshDependencies = new Set<AgentDependency>();

  for (const action of input.actions) {
    if (actionNeedsPlaceContext(action) && refreshDependencies.size > 0) {
      emitContinuation(opts, refreshDependencies);
      return;
    }

    validateAction(action, workingState, opts.context);
    const nextState = applyActionToState(action, workingState);
    const dependencies = actionChangesContext(action, workingState, nextState) ? dependenciesForAction(action) : [];
    emitAction(opts.send, action, workingState, opts.context);
    workingState = nextState;
    dependencies.forEach((dependency) => refreshDependencies.add(dependency));
  }

  if (input.continueAfterRefresh && refreshDependencies.size > 0) {
    emitContinuation(opts, refreshDependencies);
    return;
  }

  sendText(opts.send, input.message ?? "Done.");
}
