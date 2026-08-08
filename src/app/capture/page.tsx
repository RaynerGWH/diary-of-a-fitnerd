import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { ChatCapture } from "@/components/ChatCapture";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getRecentChatMessages } from "@/lib/db/queries";

function greetingFor(name: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${part}, ${name}! What's up?`;
}

export default async function CapturePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const messages = await getRecentChatMessages(profile.id);
  const name = profile.display_name ?? profile.email.split("@")[0];

  return (
    <PhoneFrame>
      <Header subtitle="tell me what's up" />
      <ChatCapture initialMessages={messages} greeting={greetingFor(name)} />
      <BottomNav active="capture" />
    </PhoneFrame>
  );
}
