import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { BottomNav } from "@/components/BottomNav";
import { ChatCapture } from "@/components/ChatCapture";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getRecentChatMessages } from "@/lib/db/queries";

// Picked fresh on every render (Server Component, so every time /capture
// loads), same pattern as HomeGreeting: reads like someone's actually there,
// instead of a templated "Good morning, {name}!" (which, with no
// display_name set, fell back to the email's local part).
const GREETINGS = [
  "What's up, Rayner?",
  "alright, alright, alright.",
  "Back at it?",
  "What's on your mind?",
  "Go ahead, I'm listening.",
  "Tell me what happened.",
  "What are we logging?",
  "Ready when you are.",
];

function pickGreeting(): string {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

export default async function CapturePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const messages = await getRecentChatMessages(profile.id);

  return (
    <PhoneFrame nav={<BottomNav active="capture" />}>
      <ChatCapture initialMessages={messages} greeting={pickGreeting()} />
    </PhoneFrame>
  );
}
