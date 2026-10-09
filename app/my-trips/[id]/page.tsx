import { TripDetails } from "@/components/dayflow/trip-details";

export default async function TripDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <TripDetails tripId={id} />;
}
