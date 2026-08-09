import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { safeNext } from "@/lib/safe-next";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { next } = await searchParams;

  return <WelcomeScreen next={safeNext(next)} />;
}
