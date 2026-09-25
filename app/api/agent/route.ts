import { EventType } from "@ag-ui/core";
import { createEventWriter } from "@/lib/agui/stream";
import { runAgent } from "@/lib/agent/run-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

type AgentRequest = {
  prompt?: string;
  threadId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as AgentRequest;
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const threadId = body.threadId ?? crypto.randomUUID();
  const runId = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = createEventWriter(controller);
      try {
        send({ type: EventType.RUN_STARTED, threadId, runId });
        await runAgent({ prompt, send });
        send({ type: EventType.RUN_FINISHED, threadId, runId });
      } catch (error) {
        send({
          type: EventType.RUN_ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
