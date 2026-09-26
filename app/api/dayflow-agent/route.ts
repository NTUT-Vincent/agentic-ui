import { EventType } from "@ag-ui/core";
import { createEventWriter } from "@/lib/agui/stream";
import { runDayFlowAgent } from "@/lib/dayflow/agent/run-agent";
import { sharedAppStateSchema } from "@/lib/dayflow/state/schema";
import type { DayFlowAgentContext } from "@/lib/dayflow/agent/context";
export const runtime="nodejs"; export const maxDuration=60;
export async function POST(request: Request) {
  const body=(await request.json()) as {prompt?:string;threadId?:string;state?:unknown;context?:DayFlowAgentContext}; const prompt=body.prompt?.trim();
  if(!prompt) return Response.json({error:"prompt is required"},{status:400});
  const parsed=sharedAppStateSchema.safeParse(body.state); if(!parsed.success) return Response.json({error:"valid state is required"},{status:400});
  const context=body.context ?? {weather:null,visiblePlaces:[]}; const threadId=body.threadId??crypto.randomUUID(),runId=crypto.randomUUID();
  const stream=new ReadableStream<Uint8Array>({async start(controller){const send=createEventWriter(controller);try{send({type:EventType.RUN_STARTED,threadId,runId});send({type:EventType.STATE_SNAPSHOT,snapshot:parsed.data});await runDayFlowAgent({prompt,state:parsed.data,context,send});send({type:EventType.RUN_FINISHED,threadId,runId});}catch(error){send({type:EventType.RUN_ERROR,message:error instanceof Error?error.message:"Unknown error"});}finally{controller.close();}}});
  return new Response(stream,{headers:{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform",Connection:"keep-alive"}});
}
