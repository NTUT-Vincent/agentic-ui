"use client";
import { useDayFlowStore } from "@/lib/dayflow/state/store";
export function StateActivity(){const mutation=useDayFlowStore((s)=>s.runtime.lastMutation);if(!mutation)return <aside className="state-activity"><strong>STATE ACTIVITY</strong><span>Waiting for interaction…</span></aside>;return <aside className={`state-activity ${mutation.source}`}><strong>STATE ACTIVITY</strong><span>{mutation.source==="agent"?"✦ Agent":"You"}</span>{mutation.paths.map((path)=><code key={path}>{path}</code>)}</aside>}
