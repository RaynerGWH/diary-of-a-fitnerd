import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getWorkout } from "@/lib/db/queries";
import { EndForm } from "./EndForm";

export default async function EndPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const workout = await getWorkout(id);
  if (!workout) redirect("/");
  if (workout.user_id !== profile.id) redirect(`/workout/${id}/peek`);

  return (
    <PhoneFrame>
      <Header subtitle="wrap it up" />
      <EndForm workoutId={workout.id} />
      <BottomNav active="start" />
    </PhoneFrame>
  );
}
