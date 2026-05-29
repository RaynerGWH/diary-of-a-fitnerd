import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { getClasses, getLocations } from "@/lib/db/queries";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { StartForm } from "./StartForm";

export default async function StartPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [locations, classes] = await Promise.all([getLocations(), getClasses()]);

  return (
    <PhoneFrame>
      <Header subtitle="start a session" />
      <StartForm locations={locations} classes={classes} />
      <BottomNav active="start" />
    </PhoneFrame>
  );
}
