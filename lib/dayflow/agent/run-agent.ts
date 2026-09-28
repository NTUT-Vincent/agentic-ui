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
  type UpdateAppStateAction,
  updateAppStateSchema,
  updateAppStateTool,
} from "./update-state-tool";

function text(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      typeof part === "string"
        ? part
        : part && typeof part === "object" && "text" in part
          ? String(part.text ?? "")
          : "",
    )
    .join("");
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

function actionResult(action: UpdateAppStateAction, context: DayFlowAgentContext) {
  switch (action.type) {
    case "set_location":
      return `Location set to ${action.locationQuery}`;
    case "set_categories":
      return action.categories.length ? `Categories set to ${action.categories.join(", ")}` : "Category filters cleared";
    case "set_radius":
      return `Search radius set to ${action.radiusKm} km`;
    case "set_environment":
      return `Environment set to ${action.environment}`;
    case "set_sort":
      return `Sorting by ${action.sortBy}`;
    case "set_view":
      return `View switched to ${action.view}`;
    case "select_place":
      return action.placeId ? `Opened ${placeName(context, action.placeId)}` : "Place selection cleared";
    case "add_to_plan":
      return `Added ${placeName(context, action.placeId)} to My Plan`;
    case "remove_from_plan":
      return `Removed ${placeName(context, action.placeId)} from My Plan`;
    case "reset_filters":
      return "Filters reset";
  }
}

function validateAction(
  action: UpdateAppStateAction,
  state: SharedAppState,
  context: DayFlowAgentContext,
) {
  const visibleIds = new Set(context.visiblePlaces.map((place) => place.id));

  if (action.type === "select_place" && action.placeId && !visibleIds.has(action.placeId)) {
    throw new Error(`Agent attempted to select unknown place id: ${action.placeId}`);
  }

  if (action.type === "add_to_plan" && !visibleIds.has(action.placeId)) {
    throw new Error(`Agent attempted to add unknown place id: ${action.placeId}`);
  }

  if (action.type === "remove_from_plan" && !state.plan.placeIds.includes(action.placeId)) {
    throw new Error(`Agent attempted to remove unknown plan item: ${action.placeId}`);
  }
}

function emitAction(
  send: (event: AgentEvent) => void,
  action: UpdateAppStateAction,
  state: SharedAppState,
  context: DayFlowAgentContext,
) {
  const toolCallId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const delta = buildActionDelta(action, state);

  send({ type: EventType.TOOL_CALL_START, toolCallId, toolCallName: "update_app_state" });
  send({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(action) });
  send({ type: EventType.TOOL_CALL_END, toolCallId });
  if (delta.length) send({ type: EventType.STATE_DELTA, delta });
  send({
    type: EventType.TOOL_CALL_RESULT,
    messageId,
    toolCallId,
    content: actionResult(action, context),
    role: "tool",
  });
}

function emitContinuation(
  opts: {
    goal: string;
    step: number;
    runId: string;
    send: (event: AgentEvent) => void;
  },
  dependencies: Set<AgentDependency>,
) {
  if (opts.step >= MAX_AGENT_STEPS) {
    sendText(opts.send, "I reached the automation step limit before I could complete every requested action.");
    return false;
  }

  opts.send({
    type: EventType.CUSTOM,
    name: "dayflow:continue",
    value: {
      goal: opts.goal,
      step: opts.step + 1,
      maxSteps: MAX_AGENT_STEPS,
      previousRunId: opts.runId,
      waitFor: [...dependencies],
    },
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
  const result = await model.bindTools([updateAppStateTool]).invoke([
    new SystemMessage(`You are DayFlow, an AI copilot embedded in an existing city discovery web app.

Complete the user's goal by operating the existing UI with update_app_state. The tool accepts an ordered actions array. Use multiple actions in one tool call when the CURRENT state and context already contain everything needed. Never invent place IDs, ratings, reviews, or facts. Only select or add place IDs present in CONTEXT.visiblePlaces.

Some actions change the context available to you:
- set_location requires the browser to geocode and refresh places/weather.
- set_radius refreshes nearby places.
- set_categories, set_environment, and reset_filters change which places are visible to the agent.

If fresh context is required before the remaining goal can be completed, include only the safe actions that can be executed now and set continueAfterRefresh=true. Do not guess a place ID from stale context. On a continuation step, inspect the new STATE and CONTEXT, do not repeat actions that are already satisfied, and continue only the unfinished work.

Prefer concise, useful action sequences. Keep the final message short. This is execution step ${opts.step} of at most ${MAX_AGENT_STEPS}.${opts.previousRunId ? ` Previous run: ${opts.previousRunId}.` : ""}

STATE:
${JSON.stringify(opts.state)}

CONTEXT:
${JSON.stringify(opts.context)}`),
    new HumanMessage(opts.goal),
  ]);

  const call = result.tool_calls?.find((item) => item.name === "update_app_state");
  if (!call) {
    sendText(opts.send, text(result.content) || "I couldn't find an action to perform.");
    return;
  }

  const input = updateAppStateSchema.parse(call.args);
  let workingState = opts.state;
  const refreshDependencies = new Set<AgentDependency>();

  for (const action of input.actions) {
    if (actionNeedsPlaceContext(action) && refreshDependencies.size > 0) {
      emitContinuation(opts, refreshDependencies);
      return;
    }

    validateAction(action, workingState, opts.context);
    emitAction(opts.send, action, workingState, opts.context);
    workingState = applyActionToState(action, workingState);

    for (const dependency of dependenciesForAction(action)) {
      refreshDependencies.add(dependency);
    }
  }

  if (input.continueAfterRefresh && refreshDependencies.size > 0) {
    emitContinuation(opts, refreshDependencies);
    return;
  }

  sendText(opts.send, input.message);
}
