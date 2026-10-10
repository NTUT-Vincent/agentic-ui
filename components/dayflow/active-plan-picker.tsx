"use client";

import { useState } from "react";
import Link from "next/link";
import { useDayFlowStore } from "@/lib/dayflow/state/store";
import type { PlanSummary } from "@/lib/dayflow/plans/client";

type Props = {
  plans: PlanSummary[];
  selectedId: string | null;
  dirty: boolean;
  busy: boolean;
  loading: boolean;
  unauthorized: boolean;
  error: string | null;
  onSelect: (id: string) => Promise<boolean>;
  onCreate: (title: string) => Promise<boolean>;
  onSave: () => Promise<boolean>;
};

export function ActivePlanPicker(props: Props) {
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const agentRunning = useDayFlowStore((s) => s.runtime.agentStatus === "running");
  const disabled = props.busy || props.loading || agentRunning;

  return (
    <section className="dayflow-active-plan">
      <div className="dayflow-active-plan-heading">
        <span className="dayflow-kicker">ACTIVE PLAN</span>
        {props.dirty && <span className="dayflow-unsaved">● Unsaved changes</span>}
      </div>
      {props.unauthorized ? (
        <p>Sign in with Google to create and edit Plans.</p>
      ) : (
        <>
          <select aria-label="Active plan" disabled={disabled}
            value={props.selectedId ?? ""}
            onChange={(event) => { if (event.target.value) void props.onSelect(event.target.value); }}>
            <option value="">Choose a Plan</option>
            {props.plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.title} ({plan.placeCount} places)
              </option>
            ))}
          </select>
          <div className="dayflow-active-plan-actions">
            <button type="button" disabled={disabled} onClick={() => setCreating((s) => !s)}>
              + New Plan
            </button>
            {props.selectedId && <Link href={"/plan?planId=" + encodeURIComponent(props.selectedId)}>Planner →</Link>}
            {props.dirty && (
              <button type="button" disabled={disabled}
                onClick={() => void props.onSave()}>Save Changes</button>
            )}
          </div>
          {creating && (
            <form onSubmit={async (event) => {
              event.preventDefault();
              if (await props.onCreate(title)) { setTitle(""); setCreating(false); }
            }}>
              <input aria-label="New Plan name" maxLength={120} required
                placeholder="e.g. Tokyo Trip" value={title}
                onChange={(event) => setTitle(event.target.value)} />
              <button type="submit" disabled={disabled || !title.trim()}>Create</button>
            </form>
          )}
        </>
      )}
      {props.error && <p className="dayflow-plan-error" role="alert">{props.error}</p>}
    </section>
  );
}
