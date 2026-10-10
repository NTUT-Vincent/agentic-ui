import { DayFlowApp } from "@/components/dayflow/dayflow-app";
export default async function Home({ searchParams }: {
  searchParams: Promise<{ planId?: string }>;
}) {
  const { planId } = await searchParams;
  return <DayFlowApp initialPlanId={planId} />;
}
