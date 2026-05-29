import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { DeckGrid } from "@/components/DeckGrid";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getProfiles } from "@/lib/db/queries";
import { createClient } from "@/lib/supabase/server";
import type { UserCard } from "@/lib/db/types";

export default async function DeckPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [{ data: cards }, profiles] = await Promise.all([
    supabase
      .from("user_cards")
      .select("*")
      .order("earned_at", { ascending: false })
      .limit(200),
    getProfiles(),
  ]);

  return (
    <PhoneFrame>
      <Header subtitle="your shared deck" />
      <DeckGrid initial={(cards as UserCard[]) ?? []} profiles={profiles} />
      <BottomNav active="deck" />
    </PhoneFrame>
  );
}
