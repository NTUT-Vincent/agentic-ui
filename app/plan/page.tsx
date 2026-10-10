import { DayFlowPlanner } from "@/components/dayflow/planner/dayflow-planner";
export default async function PlanPage({ searchParams }: {
  searchParams: Promise<{ planId?: string }>;
}) {
  const { planId } = await searchParams;
  return <DayFlowPlanner initialPlanId={planId} />;
}
