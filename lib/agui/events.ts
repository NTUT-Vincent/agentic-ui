import { EventType } from "@ag-ui/core";
import type { AgentDependency, JsonPatchOperation } from "@/lib/dayflow/state/types";

export type DayFlowContinuation = {
  goal: string;
  step: number;
  maxSteps: number;
  previousRunId: string;
  waitFor: AgentDependency[];
};

export type AgentEvent =
  | { type: EventType.RUN_STARTED; threadId: string; runId: string }
  | { type: EventType.TEXT_MESSAGE_START; messageId: string; role: "assistant" }
  | { type: EventType.TEXT_MESSAGE_CONTENT; messageId: string; delta: string }
  | { type: EventType.TEXT_MESSAGE_END; messageId: string }
  | { type: EventType.TOOL_CALL_START; toolCallId: string; toolCallName: string; parentMessageId?: string }
  | { type: EventType.TOOL_CALL_ARGS; toolCallId: string; delta: string }
  | { type: EventType.TOOL_CALL_END; toolCallId: string }
  | { type: EventType.TOOL_CALL_RESULT; messageId: string; toolCallId: string; content: string; role?: "tool" }
  | { type: EventType.STATE_SNAPSHOT; snapshot: unknown }
  | { type: EventType.STATE_DELTA; delta: JsonPatchOperation[] }
  | { type: EventType.CUSTOM; name: "a2ui"; value: unknown }
  | { type: EventType.CUSTOM; name: "dayflow:continue"; value: DayFlowContinuation }
  | { type: EventType.RUN_FINISHED; threadId: string; runId: string }
  | { type: EventType.RUN_ERROR; message: string };
