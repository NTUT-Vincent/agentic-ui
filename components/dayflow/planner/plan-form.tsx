"use client";

import type { PlanPace } from "@/lib/dayflow/state/types";
import { useDayFlowStore } from "@/lib/dayflow/state/store";

export function PlanForm() {
  const planner = useDayFlowStore((state) => state.shared.plan.planner);
  const setDays = useDayFlowStore((state) => state.setPlanDays);
  const setStartDate = useDayFlowStore((state) => state.setPlanStartDate);
  const setStartTime = useDayFlowStore((state) => state.setPlanDailyStartTime);
  const setEndTime = useDayFlowStore((state) => state.setPlanDailyEndTime);
  const setPace = useDayFlowStore((state) => state.setPlanPace);
  const setNote = useDayFlowStore((state) => state.setPlanNote);

  return (
    <section className="planner-card planner-form">
      <div className="planner-card-heading">
        <span className="dayflow-kicker">TRIP SETTINGS</span>
      </div>

      <div className="planner-grid">
        <label>
          <span>Days</span>
          <input
            type="number"
            min={1}
            max={14}
            value={planner.days}
            onChange={(event) => {
              const days = Number(event.target.value);
              if (Number.isInteger(days) && days >= 1 && days <= 14) setDays(days);
            }}
          />
        </label>
        <label>
          <span>Start date</span>
          <input type="date" value={planner.startDate ?? ""} onChange={(event) => setStartDate(event.target.value || null)} />
        </label>
        <label>
          <span>Daily start</span>
          <input type="time" value={planner.dailyStartTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>
        <label>
          <span>Daily end</span>
          <input type="time" value={planner.dailyEndTime} onChange={(event) => setEndTime(event.target.value)} />
        </label>
      </div>

      <div className="planner-field">
        <span>Pace</span>
        <div className="planner-segmented">
          {(["relaxed", "balanced", "packed"] as PlanPace[]).map((pace) => (
            <button key={pace} className={planner.pace === pace ? "active" : ""} onClick={() => setPace(pace)}>
              {pace}
            </button>
          ))}
        </div>
      </div>

      <label className="planner-field">
        <span>Anything else?</span>
        <textarea
          rows={4}
          value={planner.note}
          placeholder="Prefer outdoor places before sunset, avoid too much walking..."
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
    </section>
  );
}
