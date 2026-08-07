import { createClient } from "@/lib/supabase/server";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { SignOutButton } from "@/components/SignOutButton";

export default async function DeniedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <PhoneFrame>
      <Header subtitle="this room is invitation-only" />

      <div className="card d1">
        <div className="text-[19px] font-bold">nope, not you</div>
        <div className="text-[14px] text-[color:var(--muted)] mt-1">
          Rayner OS is locked to a private allow-list. if you think this is a mistake,
          poke Rayner. Or call the police. (but probably just poke Rayner)
        </div>
        {user?.email && (
          <div className="text-[13px] mt-3">
            signed in as <span className="font-bold">{user.email}</span>
          </div>
        )}
        <div className="mt-4">
          <SignOutButton />
        </div>
      </div>
    </PhoneFrame>
  );
}
