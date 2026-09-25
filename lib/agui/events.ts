import { EventType } from "@ag-ui/core";

export type AgentEvent =
  | { type: EventType.RUN_STARTED; threadId: string; runId: string }
  | { type: EventType.TEXT_MESSAGE_START; messageId: string; role: "assistant" }
  | { type: EventType.TEXT_MESSAGE_CONTENT; messageId: string; delta: string }
  | { type: EventType.TEXT_MESSAGE_END; messageId: string }
  | { type: EventType.CUSTOM; name: "a2ui"; value: unknown }
  | { type: EventType.RUN_FINISHED; threadId: string; runId: string }
  | { type: EventType.RUN_ERROR; message: string };
