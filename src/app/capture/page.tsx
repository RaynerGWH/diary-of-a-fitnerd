import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { CaptureForm } from "@/components/CaptureForm";
import { getCurrentProfile } from "@/lib/auth/current-user";

export default async function CapturePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <PhoneFrame>
      <Header subtitle="log it before it scatters" />
      <CaptureForm />
      <BottomNav active="capture" />
    </PhoneFrame>
  );
}
