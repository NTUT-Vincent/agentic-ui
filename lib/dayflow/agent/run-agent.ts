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
      return action.categories.length
        ? `Categories set to ${action.categories.join(", ")}`
        : "Category filters cleared";
    case "set_radius":
      return `Search radius set to ${action.radiusKm} km`;
    case "set_environment":
      return `Environment set to ${action.environment}`;
    case "set_sort":
      return `Sorting by ${action.sortBy}`;
    case "set_view":
      return `View switched to ${action.view}`;
    case "select_place":
      return action.placeId
        ? `Opened ${placeName(context, action.placeId)}`
        : "Place selection cleared";
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

function actionChangesContext(
  action: UpdateAppStateAction,
  before: SharedAppState,
  after: SharedAppState,
) {
  switch (action.type) {
    case "set_location":
      return before.location.query !== after.location.query;
    case "set_radius":
      return before.filters.radiusKm !== after.filters.radiusKm;
    case "set_categories":
      return JSON.stringify(before.filters.categories) !== JSON.stringify(after.filters.categories);
    case "set_environment":
      return before.filters.environment !== after.filters.environment;
    case "reset_filters":
      return (
        before.filters.radiusKm !== after.filters.radiusKm ||
        before.filters.environment !== after.filters.environment ||
        JSON.stringify(before.filters.categories) !== JSON.stringify(after.filters.categories)
      );
    default:
      return false;
  }
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
    console.warn("[DayFlow][continue:limit]", {
      runId: opts.runId,
      step: opts.step,
      waitFor: [...dependencies],
    });
    sendText(
      opts.send,
      "I reached the automation step limit before I could complete every requested action.",
    );
    return false;
  }

  console.log("[DayFlow][continue]", {
    runId: opts.runId,
    fromStep: opts.step,
    toStep: opts.step + 1,
    waitFor: [...dependencies],
  });

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
  const messages = [
    new SystemMessage(`You are DayFlow, an AI copilot embedded in an existing city discovery web app.

Complete the user's goal by operating the existing UI with update_app_state. The tool accepts an ordered actions array. Use multiple actions in one tool call when the CURRENT state and context already contain everything needed. Never invent place IDs, ratings, reviews, or facts. Only select or add place IDs present in CONTEXT.visiblePlaces.

Before calling update_app_state, compare the user's requested goal against the current STATE.

Do not emit actions that would leave the state unchanged. If a requested condition is already satisfied, skip that action.

Examples:
- If the view is already "map", do not call set_view("map").
- If radiusKm is already the requested value, do not call set_radius with the same value.
- If categories already match the requested categories, do not call set_categories again.
- If environment or sort order is already correct, do not set it again.
- If the requested place is already selected, do not call select_place again.
- If a place is already in the plan, do not add it again.
- If a place is already absent from the plan, do not remove it again.

Only include actions that produce a meaningful state transition.
If the entire goal is already satisfied by the current STATE, do not call update_app_state. Respond briefly that the requested state is already active.

Each action MUST include the value field that matches its type:
- set_location -> locationQuery
- set_categories -> categories
- set_radius -> radiusKm
- set_environment -> environment
- set_sort -> sortBy
- set_view -> view
- select_place / add_to_plan / remove_from_plan -> placeId
- reset_filters -> no extra value field

Examples:
{"actions":[{"type":"set_location","locationQuery":"Tokyo"}],"continueAfterRefresh":true}
{"actions":[{"type":"set_categories","categories":["cafe"]},{"type":"set_radius","radiusKm":2}],"continueAfterRefresh":true}
{"actions":[{"type":"set_view","view":"map"}],"message":"Switched to map view."}

Some actions change the context available to you:
- set_location requires the browser to geocode and refresh places/weather.
- set_radius refreshes nearby places.
- set_categories, set_environment, and reset_filters change which places are visible to the agent.

If fresh context is required before the remaining goal can be completed, include only the safe actions that can be executed now and set continueAfterRefresh=true. Do not guess a place ID from stale context. On a continuation step, inspect the new STATE and CONTEXT, do not repeat actions that are already satisfied, and continue only the unfinished work.

Prefer concise, useful action sequences. The optional message should be short. This is execution step ${opts.step} of at most ${MAX_AGENT_STEPS}.${opts.previousRunId ? ` Previous run: ${opts.previousRunId}.` : ""}

STATE:
${JSON.stringify(opts.state)}

CONTEXT:
${JSON.stringify(opts.context)}`),
    new HumanMessage(opts.goal),
  ];

  const modelStartedAt = Date.now();
  console.log("[DayFlow][model:start]", {
    runId: opts.runId,
    step: opts.step,
    timeoutMs: MODEL_TIMEOUT_MS,
    maxRetries: MODEL_MAX_RETRIES,
    visiblePlaceCount: opts.context.visiblePlaces.length,
  });

  let result;
  try {
    result = await model.bindTools([updateAppStateTool]).invoke(messages, {
      timeout: MODEL_TIMEOUT_MS,
      maxRetries: MODEL_MAX_RETRIES,
    });
    console.log("[DayFlow][model:finish]", {
      runId: opts.runId,
      step: opts.step,
      durationMs: Date.now() - modelStartedAt,
      toolCallCount: result.tool_calls?.length ?? 0,
    });
  } catch (error) {
    console.error("[DayFlow][model:error]", {
      runId: opts.runId,
      step: opts.step,
      durationMs: Date.now() - modelStartedAt,
      error,
    });
    throw error;
  }

  const call = result.tool_calls?.find((item) => item.name === "update_app_state");
  if (!call) {
    console.log("[DayFlow][tool:none]", {
      runId: opts.runId,
      step: opts.step,
    });
    sendText(opts.send, text(result.content) || "I couldn't find an action to perform.");
    return;
  }

  console.log("[DayFlow][tool:raw]", {
    runId: opts.runId,
    step: opts.step,
    args: call.args,
  });

  const input = parseUpdateAppStateInput(call.args);
  console.log("[DayFlow][tool:normalized]", {
    runId: opts.runId,
    step: opts.step,
    actions: input.actions,
    continueAfterRefresh: input.continueAfterRefresh ?? false,
  });

  let workingState = opts.state;
  const refreshDependencies = new Set<AgentDependency>();

  for (const action of input.actions) {
    if (actionNeedsPlaceContext(action) && refreshDependencies.size > 0) {
      console.log("[DayFlow][action:deferred]", {
        runId: opts.runId,
        step: opts.step,
        action,
        waitFor: [...refreshDependencies],
      });
      emitContinuation(opts, refreshDependencies);
      return;
    }

    validateAction(action, workingState, opts.context);

    const nextState = applyActionToState(action, workingState);
    const changesContext = actionChangesContext(action, workingState, nextState);
    const dependencies = changesContext ? dependenciesForAction(action) : [];

    console.log("[DayFlow][action]", {
      runId: opts.runId,
      step: opts.step,
      action,
      changesContext,
      dependencies,
    });

    emitAction(opts.send, action, workingState, opts.context);
    workingState = nextState;

    for (const dependency of dependencies) {
      refreshDependencies.add(dependency);
    }
  }

  if (input.continueAfterRefresh && refreshDependencies.size > 0) {
    emitContinuation(opts, refreshDependencies);
    return;
  }

  console.log("[DayFlow][run:complete]", {
    runId: opts.runId,
    step: opts.step,
    message: input.message ?? "Done.",
  });
  sendText(opts.send, input.message ?? "Done.");
}
