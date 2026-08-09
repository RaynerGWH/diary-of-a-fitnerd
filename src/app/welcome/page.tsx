import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { WelcomeScreen } from "@/components/WelcomeScreen";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { next } = await searchParams;
  // Only ever follow a same-origin relative path here, never an absolute
  // URL a crafted `next` param could point at.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return <WelcomeScreen next={safeNext} />;
}
