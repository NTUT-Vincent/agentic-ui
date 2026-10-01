"use client";

import { EventType } from "@ag-ui/core";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { buildAgentContext } from "@/lib/dayflow/agent/context";
import type {
  AgentDependency,
  PlaceSummary,
  WeatherSummary,
} from "@/lib/dayflow/state/types";
import { useDayFlowStore } from "@/lib/dayflow/state/store";

const CONTEXT_REFRESH_TIMEOUT_MS = 30_000;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ClientAgentEvent = {
  type: string;
  [key: string]: unknown;
};

type ActionActivity = {
  id: string;
  label: string;
  status: "running" | "completed" | "failed";
  result?: string;
};

export type DayFlowQueryStatus = {
  locationKey: string;
  placesKey: string;
  weatherKey: string;
  contextKey: string;
  placesFetching: boolean;
  weatherFetching: boolean;
};

type ContinuationValue = {
  goal: string;
  step: number;
  maxSteps: number;
  previousRunId: string;
  waitFor: AgentDependency[];
};

type PendingContinuation = ContinuationValue & {
  baseline: DayFlowQueryStatus;
};

type Props = {
  weather: WeatherSummary | null;
  visiblePlaces: PlaceSummary[];
  queryStatus: DayFlowQueryStatus;
};

function placeName(places: PlaceSummary[], placeId: unknown) {
  if (typeof placeId !== "string") return "place";
  return places.find((place) => place.id === placeId)?.name ?? "place";
}

function actionLabel(raw: string, places: PlaceSummary[]) {
  try {
    const action = JSON.parse(raw) as Record<string, unknown>;
    switch (action.type) {
      case "set_location":
        return `Switching to ${String(action.locationQuery ?? "location")}`;
      case "set_categories": {
        const categories = Array.isArray(action.categories) ? action.categories.map(String) : [];
        return categories.length ? `Showing ${categories.join(", ")}` : "Clearing category filters";
      }
      case "set_radius":
        return `Setting radius to ${String(action.radiusKm ?? "")} km`;
      case "set_environment":
        return `Filtering ${String(action.environment ?? "")} places`;
      case "set_sort":
        return `Sorting by ${String(action.sortBy ?? "")}`;
      case "set_view":
        return `Switching to ${String(action.view ?? "")} view`;
      case "select_place":
        return action.placeId ? `Opening ${placeName(places, action.placeId)}` : "Clearing selection";
      case "add_to_plan":
        return `Adding ${placeName(places, action.placeId)} to My Plan`;
      case "remove_from_plan":
        return `Removing ${placeName(places, action.placeId)} from My Plan`;
      case "reset_filters":
        return "Resetting filters";
      default:
        return "Updating DayFlow";
    }
  } catch {
    return "Updating DayFlow";
  }
}

function dependenciesReady(pending: PendingContinuation, current: DayFlowQueryStatus) {
  const needsLocation = pending.waitFor.includes("location");
  const needsPlaces = pending.waitFor.includes("places");
  const needsWeather = pending.waitFor.includes("weather");

  const locationReady = !needsLocation || current.locationKey !== pending.baseline.locationKey;
  const placesReady =
    !needsPlaces ||
    (!current.placesFetching &&
      (current.placesKey !== pending.baseline.placesKey ||
        current.contextKey !== pending.baseline.contextKey));
  const weatherReady =
    !needsWeather ||
    (!current.weatherFetching && current.weatherKey !== pending.baseline.weatherKey);

  return locationReady && placesReady && weatherReady;
}

export function DayFlowChat({ weather, visiblePlaces, queryStatus }: Props) {
  const open = useDayFlowStore((state) => state.runtime.chatOpen);
  const status = useDayFlowStore((state) => state.runtime.agentStatus);
  const runState = useDayFlowStore((state) => state.runtime.agentRun);
  const setOpen = useDayFlowStore((state) => state.setChatOpen);
  const applySnapshot = useDayFlowStore((state) => state.applyAgentSnapshot);
  const applyDelta = useDayFlowStore((state) => state.applyAgentDelta);
  const beginAgentRun = useDayFlowStore((state) => state.beginAgentRun);
  const setAgentWaiting = useDayFlowStore((state) => state.setAgentWaiting);
  const advanceAgentRun = useDayFlowStore((state) => state.advanceAgentRun);
  const finishAgentRun = useDayFlowStore((state) => state.finishAgentRun);
  const cancelAgentRun = useDayFlowStore((state) => state.cancelAgentRun);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activities, setActivities] = useState<ActionActivity[]>([]);
  const [pendingContinuation, setPendingContinuation] = useState<PendingContinuation | null>(null);

  const threadId = useRef(crypto.randomUUID());
  const argumentBuffers = useRef(new Map<string, string>());
  const resumeInFlight = useRef(false);
  const queryRef = useRef(queryStatus);
  const dataRef = useRef({ weather, visiblePlaces });

  queryRef.current = queryStatus;
  dataRef.current = { weather, visiblePlaces };

  const handleEvent = useCallback(
    (event: ClientAgentEvent) => {
      switch (event.type) {
        case EventType.STATE_SNAPSHOT:
          applySnapshot(event.snapshot);
          break;
        case EventType.STATE_DELTA:
          applyDelta(event.delta as never);
          break;
        case EventType.TEXT_MESSAGE_START:
          setMessages((current) => [
            ...current,
            { id: String(event.messageId), role: "assistant", content: "" },
          ]);
          break;
        case EventType.TEXT_MESSAGE_CONTENT:
          setMessages((current) =>
            current.map((message) =>
              message.id === String(event.messageId)
                ? { ...message, content: message.content + String(event.delta ?? "") }
                : message,
            ),
          );
          break;
        case EventType.TOOL_CALL_START: {
          const id = String(event.toolCallId);
          argumentBuffers.current.set(id, "");
          setActivities((current) => [
            ...current,
            { id, label: "Updating DayFlow", status: "running" },
          ]);
          break;
        }
        case EventType.TOOL_CALL_ARGS: {
          const id = String(event.toolCallId);
          const next = `${argumentBuffers.current.get(id) ?? ""}${String(event.delta ?? "")}`;
          argumentBuffers.current.set(id, next);
          setActivities((current) =>
            current.map((activity) =>
              activity.id === id
                ? { ...activity, label: actionLabel(next, dataRef.current.visiblePlaces) }
                : activity,
            ),
          );
          break;
        }
        case EventType.TOOL_CALL_RESULT: {
          const id = String(event.toolCallId);
          setActivities((current) =>
            current.map((activity) =>
              activity.id === id
                ? {
                    ...activity,
                    status: "completed",
                    result: String(event.content ?? "Done"),
                  }
                : activity,
            ),
          );
          break;
        }
      }
    },
    [applyDelta, applySnapshot],
  );

  const failRun = useCallback(
    (error: unknown) => {
      console.error("[DayFlow][client:run:error]", error);
      setPendingContinuation(null);
      cancelAgentRun();
      setActivities((current) =>
        current.map((activity) =>
          activity.status === "running" ? { ...activity, status: "failed" } : activity,
        ),
      );
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "Something went wrong.",
        },
      ]);
    },
    [cancelAgentRun],
  );

  const runAgentRequest = useCallback(
    async (
      goal: string,
      continuation?: { goal: string; step: number; previousRunId: string },
    ) => {
      const requestBaseline = queryRef.current;
      const state = useDayFlowStore.getState().shared;
      const currentData = dataRef.current;
      const context = buildAgentContext(state, currentData.weather, currentData.visiblePlaces);

      console.log("[DayFlow][client:request]", {
        goal,
        continuation: continuation ?? null,
        baseline: requestBaseline,
        visiblePlaceCount: currentData.visiblePlaces.length,
      });

      const response = await fetch("/api/dayflow-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: goal,
          threadId: threadId.current,
          state,
          context,
          continuation,
        }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || "Agent request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let nextContinuation: ContinuationValue | null = null;
      let runError: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          const event = JSON.parse(chunk.slice(6)) as ClientAgentEvent;

          if (event.type === EventType.CUSTOM && event.name === "dayflow:continue") {
            nextContinuation = event.value as ContinuationValue;
          } else if (event.type === EventType.RUN_ERROR) {
            runError = String(event.message ?? "Agent error");
          }

          handleEvent(event);
        }
      }

      if (runError) throw new Error(runError);

      if (nextContinuation) {
        const pending: PendingContinuation = {
          ...nextContinuation,
          baseline: requestBaseline,
        };
        console.log("[DayFlow][continuation:waiting]", {
          step: nextContinuation.step,
          waitFor: nextContinuation.waitFor,
          baseline: requestBaseline,
        });
        setPendingContinuation(pending);
        setAgentWaiting(
          nextContinuation.waitFor,
          nextContinuation.step,
          nextContinuation.previousRunId,
        );
        return;
      }

      console.log("[DayFlow][client:complete]", { goal });
      finishAgentRun();
    },
    [finishAgentRun, handleEvent, setAgentWaiting],
  );

  useEffect(() => {
    if (!pendingContinuation || resumeInFlight.current) return;

    const ready = dependenciesReady(pendingContinuation, queryStatus);
    console.log("[DayFlow][continuation:check]", {
      step: pendingContinuation.step,
      waitFor: pendingContinuation.waitFor,
      baseline: pendingContinuation.baseline,
      current: queryStatus,
      ready,
    });

    if (!ready) return;

    resumeInFlight.current = true;
    setPendingContinuation(null);
    advanceAgentRun(pendingContinuation.step, pendingContinuation.previousRunId);

    console.log("[DayFlow][continuation:resume]", {
      step: pendingContinuation.step,
      waitFor: pendingContinuation.waitFor,
    });

    void runAgentRequest(pendingContinuation.goal, {
      goal: pendingContinuation.goal,
      step: pendingContinuation.step,
      previousRunId: pendingContinuation.previousRunId,
    })
      .catch(failRun)
      .finally(() => {
        resumeInFlight.current = false;
      });
  }, [advanceAgentRun, failRun, pendingContinuation, queryStatus, runAgentRequest]);

  useEffect(() => {
    if (!pendingContinuation) return;

    const timer = window.setTimeout(() => {
      console.error("[DayFlow][continuation:timeout]", {
        step: pendingContinuation.step,
        waitFor: pendingContinuation.waitFor,
        baseline: pendingContinuation.baseline,
        current: queryRef.current,
        timeoutMs: CONTEXT_REFRESH_TIMEOUT_MS,
      });
      failRun(new Error("DayFlow could not refresh the required app context in time."));
    }, CONTEXT_REFRESH_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [failRun, pendingContinuation]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || status === "running") return;

    setInput("");
    setActivities([]);
    setPendingContinuation(null);
    argumentBuffers.current.clear();
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: prompt },
    ]);
    beginAgentRun(prompt);

    void runAgentRequest(prompt).catch(failRun);
  }

  if (!open) {
    return (
      <button className="dayflow-chat-trigger" onClick={() => setOpen(true)}>
        ✦ Ask DayFlow
      </button>
    );
  }

  return (
    <aside className="dayflow-chat">
      <header>
        <div>
          <strong>✦ DayFlow</strong>
          <small>
            {status === "running" && runState.step > 0
              ? `Executing · step ${runState.step}/${runState.maxSteps}`
              : "City Copilot"}
          </small>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </header>

      <section className="dayflow-chat-messages">
        {messages.length === 0 && (
          <div className="dayflow-chat-intro">
            <strong>What would you like to do?</strong>
            <span>Try “Show cafés within 1 km and open the closest one.”</span>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`dayflow-chat-message ${message.role}`}>
            {message.content}
          </div>
        ))}

        {activities.length > 0 && (
          <div className="dayflow-agent-activity">
            {activities.map((activity) => (
              <div key={activity.id} className={`dayflow-agent-action ${activity.status}`}>
                <span className="dayflow-agent-action-icon">
                  {activity.status === "completed"
                    ? "✓"
                    : activity.status === "failed"
                      ? "!"
                      : "✦"}
                </span>
                <div>
                  <strong>{activity.label}</strong>
                  {activity.result && <small>{activity.result}</small>}
                </div>
              </div>
            ))}
          </div>
        )}

        {status === "running" && (
          <div className="dayflow-chat-loading">
            {pendingContinuation ? "Refreshing app context…" : "Working…"}
          </div>
        )}
      </section>

      <form className="dayflow-chat-composer" onSubmit={submit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask DayFlow..."
        />
        <button type="submit" disabled={status === "running"}>
          ↑
        </button>
      </form>
    </aside>
  );
}
